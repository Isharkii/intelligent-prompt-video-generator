import Anthropic from "@anthropic-ai/sdk";
import type { ShotPrompt, GeneratedShot, VideoScript } from "../types";

// ─── Direct HTTP MCP helper ───────────────────────────────────────────────────
// Calls the Higgsfield MCP server directly (no Anthropic agent overhead).
// The MCP wire protocol is HTTP POST with JSON-RPC 2.0.

async function higgsfield_mcp_call(
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const url    = process.env.HIGGSFIELD_MCP_URL!;
  const apiKey = process.env.HIGGSFIELD_API_KEY!;

  const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() });
  const res  = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization":  `Bearer ${apiKey}`,
      "Content-Type":   "application/json",
      "Accept":         "application/json, text/event-stream",
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

async function higgsfield_generate_video(
  model: string,
  prompt: string,
  aspectRatio: string,
  durationSeconds: number
): Promise<string> {
  // Start generation
  const result = await higgsfield_mcp_call("tools/call", {
    name:      "generate_video",
    arguments: {
      params: {
        model,
        prompt,
        aspect_ratio: aspectRatio,
        duration:     Math.max(4, durationSeconds), // Higgsfield min is 4s
      },
    },
  }) as { content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown> };

  // Extract job_id from the response text
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  if (text.toLowerCase().includes("error") || text.toLowerCase().includes("invalid")) {
    throw new Error(text.slice(0, 200));
  }

  // Parse job_id — Higgsfield returns it in the content text or structuredContent
  const structured = result.structuredContent as Record<string, unknown> | undefined;
  const jobId      = (structured?.job_id as string | undefined) ?? text.match(/job[_\s]?id[:\s]+([a-zA-Z0-9_-]+)/i)?.[1];

  if (!jobId) {
    // If response already contains a URL (synchronous generation)
    const urlMatch = text.match(/https?:\/\/\S+\.mp4[^\s]*/);
    if (urlMatch) return urlMatch[0];
    throw new Error(`No job_id in generate_video response: ${text.slice(0, 200)}`);
  }

  // Poll job status until complete (up to 8 minutes)
  for (let poll = 0; poll < 96; poll++) {
    await new Promise((r) => setTimeout(r, 5000)); // 5s between polls

    const statusResult = await higgsfield_mcp_call("tools/call", {
      name:      "job_status",
      arguments: { params: { job_id: jobId } },
    }) as { content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown> };

    const statusText = statusResult.content?.find((c) => c.type === "text")?.text ?? "";
    const statusData = statusResult.structuredContent as Record<string, unknown> | undefined;
    const status     = (statusData?.status as string | undefined) ?? statusText.toLowerCase();

    if (status.includes("completed") || status.includes("done") || status.includes("succeeded")) {
      // Get the final URL
      const displayResult = await higgsfield_mcp_call("tools/call", {
        name:      "job_display",
        arguments: { params: { job_id: jobId } },
      }) as { content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown> };

      const displayText = displayResult.content?.find((c) => c.type === "text")?.text ?? "";
      const displayData = displayResult.structuredContent as Record<string, unknown> | undefined;
      const clipUrl     =
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

// ─── Model Selection ─────────────────────────────────────────────────────────
// Accepts any job_set_type string from `higgsfield model list --video`.
// Common values: cinematic_studio_3_0, veo3_1, kling3_0, wan2_7, seedance_2, grok_video

const DEFAULT_MODEL = "cinematic_studio_3_0";

function resolveModel(): string {
  return process.env.HIGGSFIELD_MODEL?.trim() || DEFAULT_MODEL;
}

// ─── Prompt Simplifier ────────────────────────────────────────────────────────

export function simplifyPrompt(prompt: string): string {
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

// ─── Output Validation ────────────────────────────────────────────────────────

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

// ─── Live Progress Table ──────────────────────────────────────────────────────

class ProgressTable {
  private lines: string[];
  private printed = false;

  constructor(shots: ShotPrompt[]) {
    this.lines = shots.map(
      (s) => `  ${s.shot_id} [${s.narrative_beat.padEnd(7)}]  ⏳ generating...`
    );
  }

  update(index: number, status: "success" | "failed" | "skipped", extra = ""): void {
    const icon = status === "success" ? "✓" : "✗";
    const base = this.lines[index].replace(/[⏳✓✗].*$/, "");
    this.lines[index] = `${base}${icon} ${
      status === "success" ? "done" + (extra ? ` — ${extra.slice(0, 60)}` : "") : status
    }`;
    this.redraw();
  }

  private redraw(): void {
    if (this.printed) {
      // Move cursor up N lines
      process.stdout.write(`\x1b[${this.lines.length}A`);
    }
    process.stdout.write(this.lines.join("\n") + "\n");
    this.printed = true;
  }

  print(): void {
    process.stdout.write(this.lines.join("\n") + "\n");
    this.printed = true;
  }
}

// ─── MCP Client ───────────────────────────────────────────────────────────────

export class HiggsFieldMCPClient {
  private readonly anthropic: Anthropic;
  private readonly mcpUrl: string;
  private readonly model: string;

  constructor() {
    this.anthropic = new Anthropic();
    this.mcpUrl    = process.env.HIGGSFIELD_MCP_URL!;
    this.model     = resolveModel();
    console.log(`✓ Higgsfield: MCP mode (model: ${this.model})`);
  }

  async generateShot(shot: ShotPrompt): Promise<GeneratedShot> {
    let lastError = "";

    for (let attempt = 1; attempt <= 2; attempt++) {
      const promptToUse = attempt === 1 ? shot.prompt : simplifyPrompt(shot.prompt);
      if (attempt === 2) {
        console.log(`  🔄 ${shot.shot_id} retry with simplified prompt...`);
      }

      try {
        const clipUrl = await this.callMcp(shot, promptToUse);

        if (!isValidClipUrl(clipUrl)) {
          lastError = `Invalid clip URL returned: "${clipUrl.slice(0, 80)}"`;
          console.warn(`  ⚠  ${shot.shot_id} output validation failed — ${lastError}`);
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

    console.log(`  ✗ ${shot.shot_id} failed after retry — skipping`);
    return {
      shot_id:          shot.shot_id,
      clip_url:         "",
      thumbnail_url:    "",
      duration_seconds: 0,
      status:           "skipped",
      error:            lastError,
    };
  }

  /**
   * Applies an ElevenLabs voiceover to an existing clip via Higgsfield MCP.
   * Returns the URL of the audio-synced video, or throws on failure.
   */
  private async callMcpLipsync(
    clipUrl: string,
    voiceoverText: string,
    voiceId: string,
  ): Promise<string> {
    const result = await higgsfield_mcp_call("tools/call", {
      name:      "lipsync",
      arguments: {
        params: {
          video_url:       clipUrl,
          text:            voiceoverText,
          elevenlabs_voice_id: voiceId,
        },
      },
    }) as { content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown> };

    const text      = result.content?.find((c) => c.type === "text")?.text ?? "";
    const structured = result.structuredContent as Record<string, unknown> | undefined;
    const urlMatch  =
      (structured?.url as string | undefined) ??
      (structured?.clip_url as string | undefined) ??
      text.match(/https?:\/\/\S+/)?.[0];

    if (urlMatch) return urlMatch;

    // Legacy code path — keep for reference
    if (false) {
      const response = undefined as any;
      for (const block of response.content) {
        if (block.type === "text") {
          const m = block.text.trim().match(/https?:\/\/\S+/);
          if (m) return m[0];
        }
      }
    }
    throw new Error("MCP lipsync response contained no clip URL");
  }

  /**
   * Applies ElevenLabs lipsync (via Higgsfield) to every successful shot that has
   * a corresponding voiceover beat in the script. B-roll shots are skipped.
   * Falls back to the raw clip if lipsync fails for any individual shot.
   */
  async applyLipsyncToShots(
    shots: GeneratedShot[],
    shotPrompts: ShotPrompt[],
    script: VideoScript,
  ): Promise<GeneratedShot[]> {
    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

    // Build beat → voiceover text lookup
    const beatVoiceover: Partial<Record<"setup" | "tension" | "payoff", string>> = {};
    for (const beat of script.beats) {
      if (beat.voiceover?.trim()) beatVoiceover[beat.beat] = beat.voiceover.trim();
    }

    // Build shot_id → ShotPrompt for narrative_beat access
    const promptMap = new Map(shotPrompts.map((p) => [p.shot_id, p]));

    const results = await Promise.allSettled(
      shots.map(async (shot) => {
        const prompt = promptMap.get(shot.shot_id);

        // Skip: failed/skipped, b-roll, or no voiceover text for this beat
        if (shot.status !== "success" || !shot.clip_url) return shot;
        if (!prompt || prompt.narrative_beat === "broll") return shot;

        const text = beatVoiceover[prompt.narrative_beat as "setup" | "tension" | "payoff"];
        if (!text) return shot;

        try {
          const newUrl = await this.callMcpLipsync(shot.clip_url, text, voiceId);
          if (!isValidClipUrl(newUrl)) {
            console.warn(`  ⚠  ${shot.shot_id} lipsync URL invalid — keeping raw clip`);
            return shot;
          }
          console.log(`  ✓ ${shot.shot_id} lipsync applied`);
          return { ...shot, clip_url: newUrl };
        } catch (err) {
          console.warn(`  ⚠  ${shot.shot_id} lipsync failed: ${String(err)} — keeping raw clip`);
          return shot;
        }
      })
    );

    return results.map((r, i) => (r.status === "fulfilled" ? r.value : shots[i]));
  }

  private async callMcp(shot: ShotPrompt, prompt: string): Promise<string> {
    return higgsfield_generate_video(
      this.model,
      prompt,
      shot.aspect_ratio,
      shot.duration_seconds
    );
  }

  // Sequential generation — avoids flooding Anthropic token-rate limits
  // (each MCP call loads the full Higgsfield tool catalog)
  async generateAllShots(shots: ShotPrompt[]): Promise<GeneratedShot[]> {
    const table = new ProgressTable(shots);
    console.log("\n🎥 Generating shots (sequential to stay within rate limits):\n");
    table.print();

    const results: GeneratedShot[] = [];
    for (let i = 0; i < shots.length; i++) {
      const result = await this.generateShot(shots[i]);
      results.push(result);
      table.update(i, result.status, result.clip_url);
    }

    console.log("");
    return results;
  }
}

// ─── Mock Client ──────────────────────────────────────────────────────────────
// Used when HIGGSFIELD_MCP_URL is not set.

const MOCK_CLIP = "https://www.w3schools.com/html/mov_bbb.mp4";

export class MockHiggsFieldClient {
  constructor() {
    console.log("✓ Higgsfield: mock mode");
  }

  async generateShot(shot: ShotPrompt): Promise<GeneratedShot> {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    return {
      shot_id:          shot.shot_id,
      clip_url:         MOCK_CLIP,
      thumbnail_url:    "",
      duration_seconds: shot.duration_seconds,
      status:           "success",
    };
  }

  async generateAllShots(shots: ShotPrompt[]): Promise<GeneratedShot[]> {
    const table = new ProgressTable(shots);
    console.log("\n🎥 Mock generating shots:\n");
    table.print();

    const results: GeneratedShot[] = [];
    for (let i = 0; i < shots.length; i++) {
      const result = await this.generateShot(shots[i]);
      results.push(result);
      table.update(i, "success", MOCK_CLIP);
    }

    console.log("");
    return results;
  }

  async applyLipsyncToShots(
    shots: GeneratedShot[],
    _shotPrompts: ShotPrompt[],
    _script: VideoScript,
  ): Promise<GeneratedShot[]> {
    console.log("  [mock] lipsync skipped — mock mode returns raw clips");
    return shots;
  }
}

export default HiggsFieldMCPClient;
