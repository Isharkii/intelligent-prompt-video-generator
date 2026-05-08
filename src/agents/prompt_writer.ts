import Anthropic from "@anthropic-ai/sdk";
import readline from "readline";
import type {
  IdeaConcept,
  SessionContext,
  ShotPrompt,
  RemotionScenePlan,
  CaptionCopy,
} from "../types";
import { training } from "../utils/training_loader";

const client = new Anthropic();

// ─── Visual style → CSV category mapping ─────────────────────────────────────

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
  concept: IdeaConcept,
  context: SessionContext
): Promise<ShotPrompt[]> {
  const vocab         = training.getShotVocabulary();
  const platformRules = training.getPlatformRules(context.platform ?? "Instagram");

  // Build CSV reference prompts closest to this concept's visual style
  const category     = mapVisualStyleToCategory(concept.visual_style);
  const refPrompts   = training.getRandomCsvPrompts(4, category);
  const csvRefSection = refPrompts.length > 0
    ? `\nREFERENCE PROMPTS — use these as style anchors:\n${refPrompts
        .map((p, i) => `Reference ${i + 1}:\n${p.slice(0, 300)}${p.length > 300 ? "..." : ""}`)
        .join("\n\n")}\n`
    : "";

  console.log(
    `💉 Shot prompt CSV injection: ${refPrompts.length} reference prompts` +
      (category ? ` (category: ${category})` : " (all categories)")
  );

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
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned) as ShotPrompt[];
  } catch {
    throw new Error(`Shot prompts: invalid JSON from model.\nRaw response (first 400 chars):\n${cleaned.slice(0, 400)}`);
  }
}

// ─── Call 2: Remotion Scene Plan ──────────────────────────────────────────────

async function writeScenePlan(
  concept: IdeaConcept,
  shots: ShotPrompt[]
): Promise<RemotionScenePlan> {
  const allStyleGuides = training.getAllStyleGuides();
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
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  let plan: RemotionScenePlan;
  try {
    plan = JSON.parse(cleaned) as RemotionScenePlan;
  } catch {
    throw new Error(`Scene plan: invalid JSON from model.\nRaw response (first 400 chars):\n${cleaned.slice(0, 400)}`);
  }

  // Code-level enforcement: AI sometimes still outputs style="none" despite instructions.
  return sanitizeScenePlanCaptions(plan, concept.visual_style);
}

/**
 * Post-processes the AI-generated scene plan to guarantee caption invariants:
 * - No style="none" on a scene that has caption text
 * - No empty text on a scene with a real style
 * - First scene always has a visible caption
 * - appear/disappear timing is valid relative to duration_frames
 */
function sanitizeScenePlanCaptions(
  plan: RemotionScenePlan,
  visualStyle: string
): RemotionScenePlan {
  const defaultStyle = (visualStyle.toLowerCase().includes("lower") || visualStyle.toLowerCase().includes("raw"))
    ? "lower_third"
    : "bold_center";

  const scenes = plan.scenes.map((scene, i) => {
    const c = scene.caption;
    let { style, text, appear_at_frame, disappear_at_frame } = c;

    // Force a real style when text exists but style is "none"
    if (style === "none" && text && text.trim()) {
      style = i === 0 ? "bold_center" : i % 2 === 0 ? defaultStyle : "lower_third";
    }

    // First scene must always have a caption
    if (i === 0 && style === "none") {
      style = "bold_center";
      if (!text || !text.trim()) text = "Watch this.";
    }

    // Clear style if text is truly empty
    if (!text || !text.trim()) {
      style = "none" as const;
    }

    // Convert absolute → relative before clamping.
    // For scenes after the first, the AI occasionally returns global timeline frames
    // (e.g. appear=250 for a scene at from_frame=240). If appear >= from_frame it's absolute.
    // scene_01 has from_frame=0, so absolute === relative — no conversion needed there.
    if (scene.from_frame > 0 && appear_at_frame >= scene.from_frame) {
      appear_at_frame    -= scene.from_frame;
      disappear_at_frame -= scene.from_frame;
    }

    // Clamp timing so appear < disappear and both fit within the scene
    const maxFrame = scene.duration_frames - 1;
    appear_at_frame    = Math.max(5,  Math.min(appear_at_frame,    maxFrame - 20));
    disappear_at_frame = Math.min(maxFrame, Math.max(disappear_at_frame, appear_at_frame + 20));

    return { ...scene, caption: { ...c, style, text, appear_at_frame, disappear_at_frame } };
  });

  return { ...plan, scenes };
}

// ─── Call 3: Caption Copy ─────────────────────────────────────────────────────

async function writeCaptionCopy(
  concept: IdeaConcept,
  context: SessionContext
): Promise<CaptionCopy> {
  const platformRules = training.getPlatformRules(context.platform ?? "Instagram");
  const bannedPhrases = training.getBannedPhrases();

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
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  let caption: CaptionCopy;
  try {
    caption = JSON.parse(cleaned) as CaptionCopy;
  } catch {
    throw new Error(`Caption copy: invalid JSON from model.\nRaw response (first 400 chars):\n${cleaned.slice(0, 400)}`);
  }

  const allText = [caption.hook_line, ...caption.body_lines, caption.cta].join(" ");
  const found   = training.checkBannedPhrases(allText);
  if (found.length > 0) {
    console.warn(`⚠  Caption contains banned phrases: ${found.join(", ")} — consider manual edit`);
  }

  return caption;
}

// ─── Production Brief ─────────────────────────────────────────────────────────

function printProductionBrief(
  concept: IdeaConcept,
  context: SessionContext,
  shots: ShotPrompt[],
  scenePlan: RemotionScenePlan,
  caption: CaptionCopy
): void {
  const brollCount = shots.filter((s) => s.narrative_beat === "broll").length;
  const mainCount  = shots.length - brollCount;

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCTION BRIEF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Concept     : ${concept.title}
Platform    : ${context.platform ?? "Instagram"}
Duration    : ${concept.duration_seconds}s
Total Shots : ${mainCount} Higgsfield + ${brollCount} B-roll overlays
Visual Style: ${concept.visual_style}
Color Grade : ${scenePlan.global_color_grade}
Music Mood  : ${scenePlan.music_mood}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHOTS QUEUED:`);

  shots.forEach((s) => {
    const preview = s.prompt.split(" ").slice(0, 10).join(" ");
    console.log(`  ${s.shot_id} · ${s.duration_seconds}s · ${s.narrative_beat} · ${preview}...`);
  });

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAPTION PREVIEW:
  "${caption.hook_line}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Type GO to begin production.
Type EDIT to cancel and start over.`);
}

async function waitForGo(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    const ask = (): void => {
      rl.question("\n> ", (answer) => {
        const trimmed = answer.trim().toUpperCase();
        if (trimmed === "GO") {
          rl.close();
          resolve();
        } else if (trimmed === "EDIT") {
          rl.close();
          reject(new Error("EDIT_REQUESTED"));
        } else {
          console.log("Type GO to begin production or EDIT to cancel.");
          ask();
        }
      });
    };
    ask();
  });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function writePrompts(
  concept: IdeaConcept,
  context: SessionContext,
  options: { skipConfirmation?: boolean } = {}
): Promise<{ shots: ShotPrompt[]; scenePlan: RemotionScenePlan; caption: CaptionCopy }> {
  console.log("\n✍  Writing shot prompts...");
  const shots = await writeShotPrompts(concept, context);
  console.log(`✓ ${shots.length} shot prompts written`);

  console.log("🎬 Building Remotion scene plan...");
  const scenePlan = await writeScenePlan(concept, shots);
  console.log(`✓ Scene plan complete — ${scenePlan.scenes.length} scenes`);

  console.log("✍  Writing caption copy...");
  const caption = await writeCaptionCopy(concept, context);
  console.log("✓ Caption copy ready");

  printProductionBrief(concept, context, shots, scenePlan, caption);
  if (!options.skipConfirmation) {
    await waitForGo();
  }

  return { shots, scenePlan, caption };
}
