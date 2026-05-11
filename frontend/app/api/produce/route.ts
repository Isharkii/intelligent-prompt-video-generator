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

VOICEOVER — TWO INDEPENDENT PATHS (both required):

PATH 1 — HIGGSFIELD NATIVE AUDIO (drives what is spoken IN the clip)
- Append a Voiceover line to the END of each shot prompt for shots 01–03 only
- Format: Voiceover: "[exact words to be spoken]"
- MAX 10 words per shot (130 wpm × 5s ≈ 11 words)
- Shot 04 (b-roll): NO Voiceover line — ambient sound only
- This line is consumed by Higgsfield/Kling to generate native spoken audio baked into the clip
- Example: Voiceover: "This is what every founder gets wrong."

PATH 2 — JSON EXTRACTION (drives the delivery screen and subtitle overlays)
- In the final JSON block, output the voiceover field with the EXACT same words from Path 1
- This is ONLY for display in the UI and subtitle overlays — it does NOT affect the video audio
- Must match Path 1 word-for-word — do not paraphrase or summarize

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
MOTION GRAPHICS — BUDGET RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOUNDATION (apply to every shot):
• zoom_pan — always include on every shot. direction: "in" | "in_left" | "in_right" | "in_up" | "in_down", intensity: 0.06–0.12
• subtitle — include on shots 01–03 whenever a voiceover line is present (one SubtitleLine matching the voiceover text, from_frame: 0, to_frame: duration × 30)

CONTEXTUAL (earn before using — max 1 per shot, max 2 total across the whole video):
• logo_reveal  — brand intro only, shot 01 maximum, only if brand is provided
• cta_card     — final shot only (shot 04 b-roll end-slate or shot 03 payoff), once per video
• stat_popup   — only when a specific number IS the point of the hook/payoff
• kinetic_type — one style, one shot; never on the same shot as subtitle; use for hook or payoff only
• particle     — only when visual_style contains "luxury", "dreamy", "ethereal", or "atmospheric"
• ui_anim      — only when the narrative arc explicitly involves showing a product UI or app screen
• chart        — only when the hook or payoff is data-driven (a stat must anchor the concept)
• cursor       — only when narrative arc is tutorial / how-it-works / product demo

CONFLICT RULES:
• Never put two contextual overlays on the same shot (e.g. kinetic_type + particle on shot 02 = rejected)
• If subtitle is on a shot, kinetic_type cannot also be on that shot — they compete for the same visual lane
• Shot 04 (b-roll) gets ONLY: zoom_pan + optionally cta_card. Nothing else. It is breathing room.
• Count your contextual uses before writing the JSON. If you've already used 2, all remaining shots get foundation only.

TONE GATES:
• particle     → visual_style must contain "luxury" / "dreamy" / "ethereal" / "atmospheric"
• ui_anim      → narrative_arc must describe showing an app, dashboard, or interface
• chart        → concept must be explicitly data-driven with a named statistic
• cursor       → narrative_arc must involve a tutorial, walkthrough, or product interaction

MOTION GRAPHICS JSON SCHEMA PER SHOT:
{
  "zoom_pan": { "direction": "in_left", "intensity": 0.08 },
  "overlays": [
    { "type": "subtitle", "config": { "lines": [{ "text": "voiceover line here", "from_frame": 0, "to_frame": 150 }] }, "appear_at_frame": 0, "disappear_at_frame": 150 },
    { "type": "cta_card", "config": { "text": "Ready to start?", "ctaText": "Watch Now" }, "appear_at_frame": 10, "disappear_at_frame": 140 }
  ]
}
If no contextual overlay applies, "overlays" contains only the subtitle entry (or is empty for shot 04 b-roll).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL JSON — output this exact block at the end, nothing after it:
\`\`\`json
{
  "shots": [
    { "shot_id": "shot_01", "clip_url": "URL", "status": "success", "duration_seconds": 5,
      "motion_graphics": { "zoom_pan": { "direction": "in_left", "intensity": 0.08 }, "overlays": [] } },
    { "shot_id": "shot_02", "clip_url": "URL", "status": "success", "duration_seconds": 5,
      "motion_graphics": { "zoom_pan": { "direction": "in_up", "intensity": 0.07 }, "overlays": [] } },
    { "shot_id": "shot_03", "clip_url": "URL", "status": "success", "duration_seconds": 5,
      "motion_graphics": { "zoom_pan": { "direction": "in_right", "intensity": 0.09 }, "overlays": [] } },
    { "shot_id": "shot_04", "clip_url": "URL", "status": "success", "duration_seconds": 5,
      "motion_graphics": { "zoom_pan": { "direction": "in", "intensity": 0.06 }, "overlays": [] } }
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
          max_tokens: 20000,
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
        // Take the LAST json block: Claude may emit intermediate reasoning blocks before the final output
        type VoiceoverScript = { shot_01?: string; shot_02?: string; shot_03?: string };
        const allJsonMatches = [...fullText.matchAll(/```json\s*([\s\S]*?)\s*```/g)];
        const jsonMatch = allJsonMatches.length > 0
          ? [null, allJsonMatches[allJsonMatches.length - 1][1]]
          : null;
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

        push(sseEvent("done", { shots, caption, voiceover, concept }));

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
