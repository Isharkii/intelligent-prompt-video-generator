/**
 * POST /api/produce
 *
 * SSE streaming endpoint. On Vercel:
 *   - Accepts already-computed shots + scenePlan + caption from /api/write-prompts
 *   - Calls Higgsfield MCP API directly via HTTP (Bearer auth, no Anthropic MCP client)
 *   - Streams per-shot progress as SSE events
 *   - Returns clip URLs; no local Remotion rendering
 *
 * Request body:
 *   { shots: ShotPrompt[], scenePlan: RemotionScenePlan, caption: CaptionCopy, context: SessionContext }
 *
 * SSE event format (same as Express backend):
 *   event: progress\ndata: { stage, status, message, detail? }\n\n
 *   event: done\ndata: { videoPath, caption, shots, concept? }\n\n
 *   event: error\ndata: { message }\n\n
 */

import { NextRequest } from "next/server";
import type {
  ShotPrompt,
  GeneratedShot,
  RemotionScenePlan,
  CaptionCopy,
  SessionContext,
} from "@/lib/types";

export const dynamic  = "force-dynamic";
export const maxDuration = 300; // Higgsfield shots can take minutes

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function progressEvent(
  stage: string,
  status: string,
  message: string,
  detail?: string
): string {
  return sseEvent("progress", { stage, status, message, ...(detail ? { detail } : {}) });
}

// ─── Higgsfield HTTP MCP ──────────────────────────────────────────────────────

async function higgsfield_mcp_call(
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const url    = process.env.HIGGSFIELD_MCP_URL;
  const apiKey = process.env.HIGGSFIELD_API_KEY;

  if (!url || !apiKey) {
    throw new Error(
      "HIGGSFIELD_MCP_URL and HIGGSFIELD_API_KEY must be set as environment variables"
    );
  }

  const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() });
  const res  = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
      "Accept":        "application/json, text/event-stream",
    },
    body,
  });

  const text = await res.text();
  // MCP over HTTP/SSE wraps the JSON-RPC response in an SSE frame
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
  const json     = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text);

  if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
  return json.result;
}

type McpResult = {
  content?: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
};

async function higgsfield_generate_video(
  model: string,
  prompt: string,
  aspectRatio: string,
  durationSeconds: number
): Promise<string> {
  const result = await higgsfield_mcp_call("tools/call", {
    name:      "generate_video",
    arguments: {
      params: {
        model,
        prompt,
        aspect_ratio: aspectRatio,
        duration:     Math.max(4, durationSeconds),
      },
    },
  }) as McpResult;

  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  if (text.toLowerCase().includes("error") || text.toLowerCase().includes("invalid")) {
    throw new Error(text.slice(0, 200));
  }

  const structured = result.structuredContent;
  const jobId =
    (structured?.job_id as string | undefined) ??
    text.match(/job[_\s]?id[:\s]+([a-zA-Z0-9_-]+)/i)?.[1];

  if (!jobId) {
    const urlMatch = text.match(/https?:\/\/\S+\.mp4[^\s]*/);
    if (urlMatch) return urlMatch[0];
    throw new Error(`No job_id in generate_video response: ${text.slice(0, 200)}`);
  }

  // Poll job status up to 8 minutes (96 × 5s)
  for (let poll = 0; poll < 96; poll++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusResult = await higgsfield_mcp_call("tools/call", {
      name:      "job_status",
      arguments: { params: { job_id: jobId } },
    }) as McpResult;

    const statusText = statusResult.content?.find((c) => c.type === "text")?.text ?? "";
    const statusData = statusResult.structuredContent;
    const status     = (statusData?.status as string | undefined) ?? statusText.toLowerCase();

    if (
      status.includes("completed") ||
      status.includes("done") ||
      status.includes("succeeded")
    ) {
      const displayResult = await higgsfield_mcp_call("tools/call", {
        name:      "job_display",
        arguments: { params: { job_id: jobId } },
      }) as McpResult;

      const displayText = displayResult.content?.find((c) => c.type === "text")?.text ?? "";
      const displayData = displayResult.structuredContent;
      const clipUrl =
        (displayData?.url as string | undefined) ??
        (displayData?.clip_url as string | undefined) ??
        displayText.match(/https?:\/\/\S+/)?.[0];

      if (clipUrl) return clipUrl;
      throw new Error(`Job ${jobId} completed but no URL found in display response`);
    }

    if (status.includes("failed") || status.includes("error")) {
      throw new Error(`Job ${jobId} failed: ${statusText.slice(0, 200)}`);
    }
  }

  throw new Error(`Job ${jobId} timed out after 8 minutes`);
}

// ─── Prompt simplifier (retry) ────────────────────────────────────────────────

function simplifyPrompt(prompt: string): string {
  const parts   = prompt.split(",").map((p) => p.trim());
  const subject = parts[0] ?? prompt;
  const lighting = parts.find((p) =>
    /light|shadow|glow|neon|sun|moon|backlit|rim|ambient|strobe/i.test(p)
  ) ?? "";
  const camera = parts.find((p) =>
    /shot|angle|close-up|wide|tracking|push|low|high|handheld|depth|portrait|frame/i.test(p)
  ) ?? "";
  const style = parts.find((p) =>
    /ultra|cinematic|realistic|photorealistic|8K|HD|quality|detailed/i.test(p)
  ) ?? "photorealistic cinematic";
  return [subject, lighting, camera, style].filter(Boolean).join(", ");
}

// ─── URL validation ───────────────────────────────────────────────────────────

const VIDEO_CDN_DOMAINS = [
  "higgsfield.ai",
  "cdn.higgsfield",
  "storage.googleapis.com",
  "s3.amazonaws.com",
  "cloudfront.net",
  "r2.cloudflarestorage.com",
];

function isValidClipUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.endsWith(".mp4")) return true;
  try {
    const hostname = new URL(url).hostname;
    return VIDEO_CDN_DOMAINS.some((d) => hostname.includes(d));
  } catch {
    return false;
  }
}

// ─── Generate one shot (with retry) ──────────────────────────────────────────

async function generateShot(
  shot: ShotPrompt,
  model: string
): Promise<GeneratedShot> {
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const promptToUse = attempt === 1 ? shot.prompt : simplifyPrompt(shot.prompt);

    try {
      const clipUrl = await higgsfield_generate_video(
        model,
        promptToUse,
        shot.aspect_ratio,
        shot.duration_seconds
      );

      if (!isValidClipUrl(clipUrl)) {
        lastError = `Invalid clip URL returned: "${clipUrl.slice(0, 80)}"`;
        continue;
      }

      return {
        shot_id:          shot.shot_id,
        clip_url:         clipUrl,
        thumbnail_url:    "",
        duration_seconds: shot.duration_seconds,
        status:           "success",
      };
    } catch (err) {
      lastError = String(err);
    }
  }

  return {
    shot_id:          shot.shot_id,
    clip_url:         "",
    thumbnail_url:    "",
    duration_seconds: 0,
    status:           "skipped",
    error:            lastError,
  };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    shots:     ShotPrompt[];
    scenePlan: RemotionScenePlan;
    caption:   CaptionCopy;
    context?:  SessionContext;
  };

  const { shots, scenePlan, caption } = body;

  if (!shots?.length) {
    return new Response(
      sseEvent("error", { message: "shots array is required and must not be empty" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const model = (process.env.HIGGSFIELD_MODEL ?? "cinematic_studio_3_0").trim();

  const stream = new ReadableStream({
    async start(controller) {
      const enc  = (s: string) => new TextEncoder().encode(s);
      const push = (s: string) => controller.enqueue(enc(s));

      try {
        push(progressEvent("higgsfield", "running", `Starting ${shots.length} shot generations`, `model: ${model}`));

        const generatedShots: GeneratedShot[] = [];

        // Sequential generation — matches Express backend behaviour
        for (let i = 0; i < shots.length; i++) {
          const shot = shots[i];
          push(progressEvent(
            "higgsfield",
            "running",
            `Generating shot ${i + 1}/${shots.length}: ${shot.shot_id}`,
            `beat: ${shot.narrative_beat} · ${shot.duration_seconds}s`
          ));

          const result = await generateShot(shot, model);
          generatedShots.push(result);

          if (result.status === "success") {
            push(progressEvent(
              "higgsfield",
              "done",
              `Shot ${shot.shot_id} ready`,
              result.clip_url.slice(0, 80)
            ));
          } else {
            push(progressEvent(
              "higgsfield",
              "warning",
              `Shot ${shot.shot_id} skipped after retry`,
              result.error?.slice(0, 120)
            ));
          }
        }

        // Inject clip URLs into scene plan
        const updatedScenes = scenePlan.scenes.map((scene) => ({
          ...scene,
          clip_url:
            generatedShots.find((s) => s.shot_id === scene.clip_source)?.clip_url ??
            scene.clip_url,
        }));

        const successCount = generatedShots.filter((s) => s.status === "success").length;

        push(progressEvent(
          "higgsfield",
          "done",
          `All shots complete — ${successCount}/${shots.length} successful`
        ));

        // Vercel: no Remotion rendering — return clip URLs directly
        push(sseEvent("done", {
          videoPath: "",           // No local render on Vercel
          caption,
          shots:      generatedShots,
          scenePlan:  { ...scenePlan, scenes: updatedScenes },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        push(sseEvent("error", { message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
