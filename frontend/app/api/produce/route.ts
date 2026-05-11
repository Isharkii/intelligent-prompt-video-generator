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

You have Higgsfield AI video generation tools. Generate 4 shots, then write caption and voiceover copy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT RULES — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Formula: SUBJECT + ACTION + ENVIRONMENT + LIGHTING + CAMERA MOVEMENT + MOOD + VOICEOVER

CRITICAL — what AI video models CAN and CANNOT do:
✓ CAN: people walking, gesturing, moving, handling objects, facial expressions
✓ CAN: environmental mood — dark rooms, sunlight, neon, rain, city lights
✓ CAN: camera moves — dolly, pan, zoom, crane, handheld
✗ CANNOT: render readable text, screens with legible data, charts, graphs, numbers
✗ CANNOT: complex multi-person conversations with lip sync
✗ CANNOT: fast cuts within a single clip

So: describe PEOPLE, OBJECTS, ENVIRONMENTS, MOODS — never mention screens with text, data, charts, or graphs.
If the concept is "pitch deck" → show a PERSON confidently presenting, gesturing, in a premium environment.
Translate abstract concepts into PHYSICAL, VISIBLE actions.

SHOT STRUCTURE:
- 4 shots: hook (0-8s), build (8-16s), payoff (16-24s), b-roll (24-30s)
- Keep visual description under 50 words — shorter prompts produce more stable video
- No jargon: just vivid, specific, physical description

VOICEOVER IN PROMPT — shots 01, 02, 03 only:
- Write a spoken narration line of MAX 10 words per narrative shot (130 wpm × 5s ≈ 11 words)
- Append it at the END of the shot prompt as: Voiceover: "[exact words to be spoken]"
- Shot 04 (b-roll): NO Voiceover line — ambient sound only
- The line must be concrete and punchy — no filler, no weak marketing phrases
- Example: Voiceover: "This is what every founder gets wrong."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODEL & PARAMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Model: kling3_0
Supported params ONLY: model, prompt, aspect_ratio, duration, mode, sound
- aspect_ratio: "9:16"
- duration: 5
- mode: "pro"  ← always use pro for quality
- sound: "on"  ← Higgsfield native audio generation

DO NOT pass: negative_prompt, genre, resolution, style — Kling 3.0 does not support these.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXACT MCP CALL FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When calling generate_video, arguments MUST use this exact structure:
{
  "params": {
    "model": "kling3_0",
    "prompt": "your prompt here",
    "aspect_ratio": "9:16",
    "duration": 5,
    "mode": "pro",
    "sound": "on"
  }
}

When calling job_status, use:
{ "params": { "job_id": "THE_JOB_ID", "sync": true } }

When calling job_display, use:
{ "params": { "job_id": "THE_JOB_ID" } }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Write all 4 shot prompts — include Voiceover line for shots 01-03, omit for shot 04
2. Call generate_video for shot_01 → get job_id  (prompt ends with Voiceover: "...")
3. Call generate_video for shot_02 → get job_id  (prompt ends with Voiceover: "...")
4. Call generate_video for shot_03 → get job_id  (prompt ends with Voiceover: "...")
5. Call generate_video for shot_04 → get job_id  (no Voiceover — ambient sound only)
6. Call job_status for each job_id with sync:true — wait until completed
7. Call job_display for each completed job → get clip URL
8. Write caption copy

Platform: ${context.platform ?? "Instagram"}${context.brand ? `\nBrand: ${context.brand}` : ""}${context.mood ? `\nMood: ${context.mood}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL JSON — output this exact block at the end, nothing after it:
\`\`\`json
{
  "shots": [
    { "shot_id": "shot_01", "clip_url": "URL", "status": "success", "duration_seconds": 5 },
    { "shot_id": "shot_02", "clip_url": "URL", "status": "success", "duration_seconds": 5 },
    { "shot_id": "shot_03", "clip_url": "URL", "status": "success", "duration_seconds": 5 },
    { "shot_id": "shot_04", "clip_url": "URL", "status": "success", "duration_seconds": 5 }
  ],
  "voiceover": {
    "shot_01": "Exact words spoken in shot 01 — max 10 words",
    "shot_02": "Exact words spoken in shot 02 — max 10 words",
    "shot_03": "Exact words spoken in shot 03 — max 10 words"
  },
  "caption": {
    "hook_line": "Pattern-interrupt opener — specific and visual",
    "body_lines": ["line 2", "line 3", "line 4"],
    "cta": "Low-friction platform CTA",
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

        // Parse Claude's JSON output — shots, caption, and voiceover all live in the same block
        type VoiceoverScript = { shot_01?: string; shot_02?: string; shot_03?: string };
        const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
        let shots:    GeneratedShot[] = [];
        let caption:  CaptionCopy | null = null;
        let voiceover: VoiceoverScript | null = null;

        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            shots     = (parsed.shots     as GeneratedShot[])    ?? [];
            caption   = (parsed.caption   as CaptionCopy)        ?? null;
            voiceover = (parsed.voiceover as VoiceoverScript)    ?? null;
          } catch {
            push(sseEvent("progress", { status: "warning", message: "Could not parse Claude's JSON output" }));
          }
        }

        const successCount = shots.filter((s) => s.status === "success").length;
        push(sseEvent("progress", {
          status:  "done",
          message: `${successCount}/${shots.length} shots generated`,
        }));

        push(sseEvent("done", { shots, caption, voiceover, concept, videoPath: "" }));

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
