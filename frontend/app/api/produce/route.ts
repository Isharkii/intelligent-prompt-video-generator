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
TEMPORAL COHERENCE — TOP PRIORITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Jitter, micro-shaking, and frame inconsistency are caused by too many simultaneous motion vectors.
Every prompt decision must prioritise smooth, physically stable output over cinematic complexity.

RULE 1 — ONE motion source per shot (hard limit)
Pick exactly one: camera drifts slowly OR subject makes one contained gesture. Never both.
✗ BANNED combinations:
  - camera push-in + subject walking toward camera
  - camera orbit + multiple characters moving independently
  - dolly zoom + handshake animation
  - pull-back + multi-person scene
✓ STABLE combinations:
  - locked-off camera + subject standing, breathing, subtle head turn
  - imperceptibly slow forward drift + fully static scene
  - single slow pan + subject seated still

RULE 2 — Camera motion vocabulary (violations cause jitter)
✗ NEVER use: orbit, dolly zoom, pull back, push in, handheld, crane, whip, dynamic, sweeping
✓ ONLY use: "locked off", "static camera", "imperceptibly slow forward drift",
             "barely perceptible slow zoom", "gentle slow pan left" or "gentle slow pan right"

RULE 3 — Subject motion: single, contained, nearly-static
- One focal subject maximum per shot
- Subject state: standing still, seated, holding an object — micro-expressions and breathing only
- No simultaneous actions across multiple people (e.g. investor leaning + founder gesturing = jitter)
- Shot 04 (b-roll): NO people — objects only, fully static or single slow drift

RULE 4 — Scene and environment simplicity
- Avoid: mirrors, rain, smoke, bokeh explosions, complex reflections, fast-moving background elements
- Max 2 people in frame; if 2, both must be static
- Do not describe depth-of-field — the model handles it

RULE 5 — Prompt length: 30–40 words maximum (excluding Voiceover line)
One subject. One setting. One light source. One motion. That is the whole prompt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT FORMULA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT (one person or object) + SINGLE STATIC/NEAR-STATIC ACTION + ENVIRONMENT + LIGHTING + ONE CAMERA STATE + MOOD

WHAT AI VIDEO MODELS CAN AND CANNOT DO:
✓ CAN: person standing still, subtle facial expression, slow breathing, holding an object
✓ CAN: environmental mood — softly lit room, window light, clean studio, golden hour
✓ CAN: one slow camera motion — drift, slow pan, locked off
✗ CANNOT: readable text on screens, charts, graphs, data displays
✗ CANNOT: complex lip sync or multi-person simultaneous movement

Translate every abstract concept into a single physical, visible, nearly-static scene.
"Pitch deck" → one person standing confidently, looking at camera, premium room, locked-off shot.

SHOT STRUCTURE (4 shots × 4 seconds = 16s total):
- Shot 01 hook:    Single strong image — one subject, locked camera, visual scroll-stopper
- Shot 02 build:   Close-up detail or different angle — one object or face, static camera
- Shot 03 payoff:  Reveal or reaction — one subject, one gesture max, drift or locked
- Shot 04 b-roll:  Object only, no people, locked or barely drifting — breathing room

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICEOVER — TWO INDEPENDENT PATHS (both required)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATH 1 — HIGGSFIELD NATIVE AUDIO (drives what is spoken IN the clip)
- Append a Voiceover line to the END of each shot prompt for shots 01–03 only
- Format: Voiceover: "[exact words to be spoken]"
- MAX 8 words per shot (130 wpm × 4s ≈ 8 words)
- Shot 04 (b-roll): NO Voiceover line — ambient sound only
- Example: Voiceover: "Your deck just lost the room."

PATH 2 — JSON EXTRACTION (drives UI display and subtitle overlays)
- In the final JSON block, output the voiceover field with the EXACT same words from Path 1
- Must match Path 1 word-for-word

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODEL & PARAMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Model: kling3_0
Supported params ONLY: model, prompt, aspect_ratio, duration, mode, sound
- aspect_ratio: "9:16"
- duration: 4  ← 4s clips have better temporal stability than 5–8s
- mode: "pro"
- sound: "on"

DO NOT pass: negative_prompt, genre, resolution, style — not supported.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXACT MCP CALL FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When calling generate_video:
{
  "params": {
    "model": "kling3_0",
    "prompt": "your prompt here",
    "aspect_ratio": "9:16",
    "duration": 4,
    "mode": "pro",
    "sound": "on"
  }
}

When calling job_status:
{ "jobId": "THE_JOB_ID", "sync": true }

When calling job_display:
{ "ids": ["THE_JOB_ID"] }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Write all 4 shot prompts (apply temporal coherence rules — verify no banned camera words)
2. Call generate_video for shot_01 → get job_id
3. Call generate_video for shot_02 → get job_id
4. Call generate_video for shot_03 → get job_id
5. Call generate_video for shot_04 → get job_id  (no people, no voiceover)
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
• Never put two contextual overlays on the same shot
• If subtitle is on a shot, kinetic_type cannot also be on that shot
• Shot 04 (b-roll) gets ONLY: zoom_pan + optionally cta_card
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
    { "type": "subtitle", "config": { "lines": [{ "text": "voiceover line here", "from_frame": 0, "to_frame": 120 }] }, "appear_at_frame": 0, "disappear_at_frame": 120 },
    { "type": "cta_card", "config": { "text": "Ready to start?", "ctaText": "Watch Now" }, "appear_at_frame": 10, "disappear_at_frame": 110 }
  ]
}
If no contextual overlay applies, "overlays" contains only the subtitle entry (or is empty for shot 04 b-roll).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL JSON — output this exact block at the end, nothing after it:
\`\`\`json
{
  "shots": [
    { "shot_id": "shot_01", "clip_url": "URL", "status": "success", "duration_seconds": 4,
      "motion_graphics": { "zoom_pan": { "direction": "in_left", "intensity": 0.08 }, "overlays": [] } },
    { "shot_id": "shot_02", "clip_url": "URL", "status": "success", "duration_seconds": 4,
      "motion_graphics": { "zoom_pan": { "direction": "in_up", "intensity": 0.07 }, "overlays": [] } },
    { "shot_id": "shot_03", "clip_url": "URL", "status": "success", "duration_seconds": 4,
      "motion_graphics": { "zoom_pan": { "direction": "in_right", "intensity": 0.09 }, "overlays": [] } },
    { "shot_id": "shot_04", "clip_url": "URL", "status": "success", "duration_seconds": 4,
      "motion_graphics": { "zoom_pan": { "direction": "in", "intensity": 0.06 }, "overlays": [] } }
  ],
  "voiceover": {
    "shot_01": "Exact words spoken in shot 01 — max 8 words",
    "shot_02": "Exact words spoken in shot 02 — max 8 words",
    "shot_03": "Exact words spoken in shot 03 — max 8 words"
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
          model:      "claude-sonnet-4-6",
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
        const allJsonMatches = Array.from(fullText.matchAll(/```json\s*([\s\S]*?)\s*```/g));
        const jsonMatch = allJsonMatches.length > 0
          ? [null, allJsonMatches[allJsonMatches.length - 1][1]]
          : null;
        let shots:    GeneratedShot[] = [];
        let caption:  CaptionCopy | null = null;
        let voiceover: VoiceoverScript | null = null;

        if (jsonMatch && jsonMatch[1]) {
          try {
            const parsed = JSON.parse(jsonMatch[1] as string);
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
