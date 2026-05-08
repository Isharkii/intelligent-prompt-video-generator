/**
 * POST /api/produce
 *
 * Claude is the autonomous MCP orchestrator.
 * It receives the selected concept + session context, engineers its own
 * shot prompts, selects models, calls Higgsfield tools directly, and
 * chains generation → polling → retrieval completely on its own.
 *
 * The client sees Claude's decisions and tool calls in real-time via SSE.
 *
 * SSE events:
 *   event: text     data: { chunk: string }          — Claude's live text stream
 *   event: tool     data: { name, input? }            — tool call started
 *   event: progress data: { message, status }         — status update
 *   event: done     data: { shots, caption, concept } — final result
 *   event: error    data: { message }
 */

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { IdeaConcept, SessionContext, GeneratedShot, CaptionCopy } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildSystemPrompt(context: SessionContext): string {
  return `You are an autonomous AI video production director for short-form social media.

You have Higgsfield AI video generation tools. Produce the given concept completely — engineer all prompts yourself, select the best model, generate every shot, and write caption copy with voiceover script.

SHOT PROMPT FORMULA — all elements required:
SUBJECT + ACTION + ENVIRONMENT + LIGHTING + CAMERA MOVEMENT + MOOD + STYLE SUFFIX

SHOT RULES:
- 4 shots total: shot_01 (setup 0–10s), shot_02 (tension 10–20s), shot_03 (payoff 20–30s), shot_04 (b-roll)
- Each shot: duration 4, aspect_ratio "9:16"
- negative_prompt: "blurry, overexposed, amateur, shaky, text on screen, watermark"
- Never repeat the same camera movement in consecutive shots
- First shot must be visually arresting — the hook
- Last shot must feel conclusive or loop-able

MODEL SELECTION:
- Default model: "kling3_0" — reliable, fast, cinematic quality
- Only use models_explore if the brief clearly demands a specialist model
- Never use seedance_2_0 — it is currently unavailable (500 errors)

WORKFLOW — do these steps in order:
1. Think through each shot prompt based on the visual style and narrative arc
2. Call generate_video for shot_01 with model "kling3_0", note the job_id
3. Call generate_video for shot_02 with model "kling3_0", note the job_id
4. Call generate_video for shot_03 with model "kling3_0", note the job_id
5. Call generate_video for shot_04 with model "kling3_0", note the job_id
6. Poll job_status for each job_id until status is "completed", "done", or "succeeded"
7. For each completed job, call job_display to get the clip URL
8. Write the caption copy and voiceover script

VOICEOVER SCRIPT RULES:
- Write exact words for text-to-speech narration, under 50 words total
- hook_line: first 3 seconds, grabs attention immediately — be specific and punchy
- body_script: 2–3 short sentences, no filler words
- outro_line: closing line or CTA spoken aloud

Platform: ${context.platform ?? "Instagram"}${context.brand ? `\nBrand voice: ${context.brand}` : ""}${context.mood ? `\nMood/energy: ${context.mood}` : ""}

FINAL JSON — end your response with exactly this block (no other text after it):
\`\`\`json
{
  "model_used": "model_id_chosen_by_models_explore",
  "shots": [
    { "shot_id": "shot_01", "clip_url": "URL_HERE", "status": "success", "duration_seconds": 4, "thumbnail_url": "" },
    { "shot_id": "shot_02", "clip_url": "URL_HERE", "status": "success", "duration_seconds": 4, "thumbnail_url": "" },
    { "shot_id": "shot_03", "clip_url": "URL_HERE", "status": "success", "duration_seconds": 4, "thumbnail_url": "" },
    { "shot_id": "shot_04", "clip_url": "URL_HERE", "status": "success", "duration_seconds": 4, "thumbnail_url": "" }
  ],
  "voiceover": {
    "hook_line": "First 3 seconds — punchy spoken hook",
    "body_script": "Main narration — 2-3 short punchy sentences",
    "outro_line": "Closing line or spoken CTA"
  },
  "caption": {
    "hook_line": "pattern-interrupt first line — specific and visual",
    "body_lines": ["expand the hook", "tension or revelation", "payoff or proof"],
    "cta": "platform-appropriate low-friction call to action",
    "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
  }
}
\`\`\``;
}

function buildUserMessage(concept: IdeaConcept, context: SessionContext): string {
  return `Produce this concept now.

CONCEPT: ${concept.title}
Topic: ${context.topic}${context.brand ? `\nBrand: ${context.brand}` : ""}
Visual style: ${concept.visual_style}
Target emotion: ${concept.target_emotion}
Duration: ${concept.duration_seconds}s
Hook: ${concept.hook}

NARRATIVE ARC:
- Setup (0–10s): ${concept.narrative_arc.beat_1_setup}
- Tension (10–20s): ${concept.narrative_arc.beat_2_tension}
- Payoff (20–30s): ${concept.narrative_arc.beat_3_payoff}

Engineer shot prompts, generate all clips via Higgsfield, write the caption, return the final JSON.`;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { concept: IdeaConcept; context: SessionContext };
  const { concept, context } = body;

  if (!concept?.id || !context?.topic) {
    return new Response(
      sseEvent("error", { message: "concept and context.topic are required" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const mcpUrl = process.env.HIGGSFIELD_MCP_URL;
  const apiKey = process.env.HIGGSFIELD_API_KEY;

  if (!mcpUrl || !apiKey) {
    return new Response(
      sseEvent("error", { message: "HIGGSFIELD_MCP_URL and HIGGSFIELD_API_KEY must be set" }),
      { status: 500, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const readable = new ReadableStream({
    async start(controller) {
      const enc  = (s: string) => new TextEncoder().encode(s);
      const push = (s: string) => controller.enqueue(enc(s));

      try {
        push(sseEvent("progress", { status: "running", message: "Claude is reading your concept..." }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = await (client.beta.messages as any).create({
          model:      "claude-opus-4-7",
          max_tokens: 16000,
          system:     buildSystemPrompt(context),
          messages:   [{ role: "user", content: buildUserMessage(concept, context) }],
          betas:      ["mcp-client-2025-04-04"],
          mcp_servers: [{
            type:                "url",
            name:                "higgsfield",
            url:                 mcpUrl,
            authorization_token: apiKey,
          }],
          stream: true,
        });

        let fullText    = "";
        let toolName    = "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const event of stream as AsyncIterable<any>) {
          if (event.type === "content_block_start") {
            const block = event.content_block;
            if (block?.type === "tool_use") {
              toolName = block.name as string;
              push(sseEvent("tool", { name: toolName }));
            }
          } else if (event.type === "content_block_delta") {
            const delta = event.delta;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
              fullText += delta.text;
              push(sseEvent("text", { chunk: delta.text }));
            }
          } else if (event.type === "content_block_stop") {
            if (toolName) {
              push(sseEvent("tool", { name: toolName, done: true }));
              toolName = "";
            }
          }
        }

        // Parse Claude's JSON output
        const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
        let shots:   GeneratedShot[] = [];
        let caption: CaptionCopy | null = null;

        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            shots   = (parsed.shots   as GeneratedShot[]) ?? [];
            caption = (parsed.caption as CaptionCopy)     ?? null;
          } catch {
            push(sseEvent("progress", { status: "warning", message: "Could not parse Claude's JSON output" }));
          }
        }

        const successCount = shots.filter((s) => s.status === "success").length;
        push(sseEvent("progress", {
          status:  "done",
          message: `${successCount}/${shots.length} shots generated`,
        }));

        const voMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
        let voiceover = null;
        let modelUsed = "";
        if (voMatch) {
          try {
            const p = JSON.parse(voMatch[1]);
            voiceover = p.voiceover ?? null;
            modelUsed = p.model_used ?? "";
          } catch { /* ignore */ }
        }

        push(sseEvent("done", { shots, caption, voiceover, modelUsed, concept, videoPath: "" }));

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        push(sseEvent("error", { message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
