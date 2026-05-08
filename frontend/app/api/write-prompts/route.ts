/**
 * POST /api/write-prompts
 *
 * Self-contained Anthropic calls — no Express backend required.
 * Replicates the three Anthropic calls in src/agents/prompt_writer.ts exactly:
 *   Call 1 — shot prompts
 *   Call 2 — Remotion scene plan
 *   Call 3 — caption copy
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type {
  IdeaConcept,
  SessionContext,
  ShotPrompt,
  RemotionScenePlan,
  RemotionScene,
  CaptionCopy,
} from "@/lib/types";
import {
  getShotVocabulary,
  getPlatformRules,
  getAllStyleGuides,
  getBannedPhrases,
  checkBannedPhrases,
  getRandomCsvPrompts,
} from "@/lib/server/training";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function cleanJson(text: string): string {
  return text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
}

function mapVisualStyleToCategory(visualStyle: string): string | undefined {
  const lower = visualStyle.toLowerCase();
  if (lower.includes("cinematic") || lower.includes("golden") || lower.includes("warm"))
    return "cinematic";
  if (lower.includes("cyber") || lower.includes("noir") || lower.includes("neon") || lower.includes("tech"))
    return "cyberpunk";
  if (lower.includes("fashion") || lower.includes("editorial") || lower.includes("luxury"))
    return "fashion";
  if (lower.includes("candid") || lower.includes("street") || lower.includes("raw") || lower.includes("handheld"))
    return "candid";
  if (lower.includes("portrait") || lower.includes("dramatic") || lower.includes("close-up"))
    return "portrait";
  return undefined;
}

// ─── Call 1: Shot Prompts ─────────────────────────────────────────────────────

async function writeShotPrompts(
  client: Anthropic,
  concept: IdeaConcept,
  context: SessionContext
): Promise<ShotPrompt[]> {
  const vocab         = getShotVocabulary();
  const platformRules = getPlatformRules(context.platform ?? "Instagram");

  const category     = mapVisualStyleToCategory(concept.visual_style);
  const refPrompts   = getRandomCsvPrompts(4, category);
  const csvRefSection = refPrompts.length > 0
    ? `\nREFERENCE PROMPTS — use these as style anchors:\n${refPrompts
        .map((p, i) => `Reference ${i + 1}:\n${p.slice(0, 300)}${p.length > 300 ? "..." : ""}`)
        .join("\n\n")}\n`
    : "";

  const systemPrompt = `You are a Higgsfield AI video director writing shot prompts for social media production.

VOCABULARY BANK — use these exact terms in your prompts:
Lighting: ${vocab.lighting.join(" | ")}
Camera movements: ${vocab.camera_movements.join(" | ")}
Mood language: ${vocab.mood_language.join(" | ")}
Style suffixes: ${vocab.style_suffixes.join(" | ")}

SHOT PROMPT FORMULA — all 7 elements required for every prompt:
SUBJECT + ACTION + ENVIRONMENT + LIGHTING + CAMERA MOVEMENT + MOOD + STYLE
${csvRefSection}
RULES:
- Never use the same camera movement in two consecutive shots
- First shot must be the most visually arresting — the hook lives here
- Last shot must feel conclusive or loop-able
- Main narrative shots: 3–5 seconds each
- B-roll shots: 2–4 seconds each
- negative_prompt always includes: "blurry, overexposed, amateur, shaky, text on screen, watermark"
- aspect_ratio: "9:16" for ${platformRules.platform}

Return ONLY a valid JSON array of ShotPrompt objects. No markdown, no explanation.`;

  const userPrompt = `CONCEPT: ${concept.title}
Topic: ${context.topic}
${context.brand ? `Brand: ${context.brand}` : ""}
Visual style: ${concept.visual_style}
Target emotion: ${concept.target_emotion}
Duration: ${concept.duration_seconds}s

NARRATIVE ARC:
- Setup (0-10s): ${concept.narrative_arc.beat_1_setup}
- Tension (10-20s): ${concept.narrative_arc.beat_2_tension}
- Payoff (20-30s): ${concept.narrative_arc.beat_3_payoff}

Write one shot per narrative beat (setup, tension, payoff) plus 1–2 b-roll shots.

Each shot object:
{
  "shot_id": "shot_01",
  "narrative_beat": "setup",
  "duration_seconds": 4,
  "prompt": "Full 7-element prompt — use vocabulary bank terms",
  "negative_prompt": "blurry, overexposed, amateur, shaky, text on screen, watermark",
  "aspect_ratio": "9:16",
  "style_preset": "cinematic",
  "motion_intensity": "moderate"
}

Return ONLY the JSON array.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text    = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = cleanJson(text);
  try {
    return JSON.parse(cleaned) as ShotPrompt[];
  } catch {
    throw new Error(
      `Shot prompts: invalid JSON from model.\nRaw response (first 400 chars):\n${cleaned.slice(0, 400)}`
    );
  }
}

// ─── Call 2: Remotion Scene Plan ──────────────────────────────────────────────

function sanitizeScenePlanCaptions(
  plan: RemotionScenePlan,
  visualStyle: string
): RemotionScenePlan {
  const defaultStyle = (
    visualStyle.toLowerCase().includes("lower") || visualStyle.toLowerCase().includes("raw")
  )
    ? "lower_third"
    : "bold_center";

  const scenes: RemotionScene[] = plan.scenes.map((scene, i) => {
    const c = scene.caption;
    let { style, text, appear_at_frame, disappear_at_frame } = c;

    if (style === "none" && text && text.trim()) {
      style = i === 0 ? "bold_center" : i % 2 === 0 ? defaultStyle : "lower_third";
    }

    if (i === 0 && style === "none") {
      style = "bold_center";
      if (!text || !text.trim()) text = "Watch this.";
    }

    if (!text || !text.trim()) {
      style = "none" as const;
    }

    if (scene.from_frame > 0 && appear_at_frame >= scene.from_frame) {
      appear_at_frame    -= scene.from_frame;
      disappear_at_frame -= scene.from_frame;
    }

    const maxFrame = scene.duration_frames - 1;
    appear_at_frame    = Math.max(5,  Math.min(appear_at_frame,    maxFrame - 20));
    disappear_at_frame = Math.min(maxFrame, Math.max(disappear_at_frame, appear_at_frame + 20));

    return { ...scene, caption: { ...c, style, text, appear_at_frame, disappear_at_frame } };
  });

  return { ...plan, scenes };
}

async function writeScenePlan(
  client: Anthropic,
  concept: IdeaConcept,
  shots: ShotPrompt[]
): Promise<RemotionScenePlan> {
  const allStyleGuides = getAllStyleGuides();
  const closestGuide =
    allStyleGuides.find((s) =>
      concept.visual_style.toLowerCase().includes(s.name.replace(/_/g, " "))
    ) ?? allStyleGuides[0];

  const systemPrompt = `You are a Remotion video compositor mapping shot prompts to a timeline.

STYLE GUIDE for "${concept.visual_style}" (use these to pick transitions and color grade):
Lighting vocabulary: ${closestGuide.lighting.join(" | ")}
Mood: ${closestGuide.mood_descriptors.join(" | ")}

TRANSITION MAPPING:
- cyber_noir / glitchy / tech → prefer "glitch" and "cut"
- cinematic / golden / warm → prefer "fade" and "zoom_blur"
- raw / handheld / candid → prefer "cut" and "whip_pan"
- luxury / editorial → prefer "fade" and "zoom_blur"

COLOR GRADE MAPPING:
- warm / golden / cinematic → "warm_cinematic"
- cyber / dark / cold / tech → "cold_tech"
- raw / documentary / desaturated → "desaturated_raw"
- luxury / vibrant / editorial → "vibrant_pop"

CAPTION RULES (MANDATORY):
- caption.style MUST be "bold_center", "lower_third", or "kinetic" for EVERY scene
- NEVER use "none" unless the scene is pure b-roll with zero narrative text
- The first scene MUST have caption style "bold_center" — it is the hook
- appear_at_frame: 10 (relative to scene start)
- disappear_at_frame: duration_frames - 15 (relative to scene start)
- disappear_at_frame MUST be at least 20 frames greater than appear_at_frame

CAPTION TEXT RULES FOR INSTAGRAM PORTRAIT VIDEO:
- bold_center: MAX 6 words. ALL CAPS. Scroll-stopping statements, not sentences.
  Examples: "YOU'RE DOING IT WRONG" / "THIS CHANGES EVERYTHING" / "WATCH WHAT HAPPENS"
- lower_third: MAX 8 words. Title case. Context or speaker identification.
  Examples: "The problem with cold brew" / "Step 2: The extraction"
- kinetic: MAX 4 words. Single punchy idea.
  Examples: "Just like that" / "Every Single Time" / "Wait for it"
- NEVER describe what is visually obvious in the shot
- NEVER end a caption with a period — it kills energy
- NEVER use the word "I" in a caption — speak to the viewer
- NEVER write generic phrases like "Check this out" or "Amazing results"

Return ONLY a valid JSON object as RemotionScenePlan. No markdown, no explanation.`;

  const userPrompt = `Concept: ${concept.title}
Visual style: ${concept.visual_style}
Total duration: ${concept.duration_seconds}s → ${concept.duration_seconds * 30} frames at 30fps

SHOTS TO MAP:
${shots
  .map(
    (s) =>
      `${s.shot_id} | beat: ${s.narrative_beat} | duration: ${s.duration_seconds}s | frames: ${s.duration_seconds * 30}`
  )
  .join("\n")}

Build the RemotionScenePlan. Scenes must be contiguous (from_frame of each scene = sum of all previous duration_frames).

Schema:
{
  "composition_id": "final_video",
  "fps": 30,
  "total_duration_frames": ${concept.duration_seconds * 30},
  "aspect_ratio": "9:16",
  "scenes": [
    {
      "scene_id": "scene_01",
      "from_frame": 0,
      "duration_frames": 120,
      "clip_source": "shot_01",
      "transition_in": "cut",
      "transition_out": "fade",
      "caption": {
        "text": "Short caption under 8 words",
        "style": "bold_center",
        "appear_at_frame": 10,
        "disappear_at_frame": 105
      },
      "broll_overlay": { "enabled": false, "type": "none" },
      "audio_note": "fade in"
    }
  ],
  "global_color_grade": "warm_cinematic",
  "caption_font": "Inter Bold",
  "music_mood": "cinematic"
}

Return ONLY the JSON object.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text    = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = cleanJson(text);
  let plan: RemotionScenePlan;
  try {
    plan = JSON.parse(cleaned) as RemotionScenePlan;
  } catch {
    throw new Error(
      `Scene plan: invalid JSON from model.\nRaw response (first 400 chars):\n${cleaned.slice(0, 400)}`
    );
  }

  return sanitizeScenePlanCaptions(plan, concept.visual_style);
}

// ─── Call 3: Caption Copy ─────────────────────────────────────────────────────

async function writeCaptionCopy(
  client: Anthropic,
  concept: IdeaConcept,
  context: SessionContext
): Promise<CaptionCopy> {
  const platformRules = getPlatformRules(context.platform ?? "Instagram");
  const bannedPhrases = getBannedPhrases();

  const systemPrompt = `You are a social media copywriter writing post captions.

PLATFORM: ${platformRules.platform}
Caption style: ${platformRules.caption_style}
Caption length: ${platformRules.caption_length}
Hashtag count: exactly ${platformRules.hashtag_count}
CTA style: ${platformRules.cta_style}

BANNED PHRASES — never use any of these:
${bannedPhrases.join(", ")}

RULES:
- Hook line: must create a pattern interrupt or curiosity gap matching the concept's hook energy
- Body lines: expand → tension or revelation → payoff or proof (3 lines)
- CTA: low-friction, platform-appropriate, specific
- Every line must be specific and visual — no generic marketing language
- Return ONLY valid JSON as CaptionCopy. No markdown, no explanation.`;

  const userPrompt = `Concept: ${concept.title}
Hook: ${concept.hook}
Topic: ${context.topic}
${context.brand ? `Brand: ${context.brand}` : ""}
${context.goal  ? `Goal: ${context.goal}`   : ""}
Visual style: ${concept.visual_style}
Target emotion: ${concept.target_emotion}

Write caption copy:
{
  "hook_line": "pattern-interrupt first line",
  "body_lines": ["expand the hook", "tension or revelation", "payoff or proof"],
  "cta": "${platformRules.cta_style}",
  "hashtags": ${JSON.stringify(Array(platformRules.hashtag_count).fill("#placeholder"))},
  "caption_style": "${platformRules.caption_style}"
}

Return ONLY the JSON object.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text    = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = cleanJson(text);
  let caption: CaptionCopy;
  try {
    caption = JSON.parse(cleaned) as CaptionCopy;
  } catch {
    throw new Error(
      `Caption copy: invalid JSON from model.\nRaw response (first 400 chars):\n${cleaned.slice(0, 400)}`
    );
  }

  // Warn on banned phrases (do not block)
  const allText = [caption.hook_line, ...caption.body_lines, caption.cta].join(" ");
  const found   = checkBannedPhrases(allText);
  if (found.length > 0) {
    console.warn(`Caption contains banned phrases: ${found.join(", ")}`);
  }

  return caption;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { concept: IdeaConcept; context: SessionContext };
    const { concept, context } = body;

    if (!concept?.id || !context?.topic) {
      return NextResponse.json(
        { error: "concept and context.topic are required" },
        { status: 400 }
      );
    }

    const client = getClient();

    const [shots, caption] = await Promise.all([
      writeShotPrompts(client, concept, context),
      writeCaptionCopy(client, concept, context),
    ]);

    const scenePlan = await writeScenePlan(client, concept, shots);

    return NextResponse.json({ shots, scenePlan, caption });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
