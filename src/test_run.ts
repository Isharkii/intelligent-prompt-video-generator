import "dotenv/config";
import path from "path";
import fs from "fs";
import type {
  SessionContext,
  IdeaConcept,
  ShotPrompt,
  RemotionScenePlan,
  CaptionCopy,
  GeneratedShot,
  ProductionPackage,
} from "./types";
import { training } from "./utils/training_loader";
import { generateIdeas, formatIdeasForDisplay } from "./agents/idea_generator";
import { writeSceneConfig } from "./integrations/remotion_runner";
import { MockHiggsFieldClient } from "./integrations/higgsfield";
import { loadCsvTrainingData } from "./utils/csv_loader";

// Hardcoded test context
const TEST_CONTEXT: SessionContext = {
  topic: "morning coffee ritual",
  brand: "minimalist lifestyle brand",
  platform: "Instagram",
  goal: "Awareness",
  mood: "calm",
};

type StageResult = {
  stage: string;
  passed: boolean;
  detail: string;
};

function pass(stage: string, detail: string): StageResult {
  return { stage, passed: true, detail };
}

function fail(stage: string, detail: string): StageResult {
  return { stage, passed: false, detail };
}

function assertString(val: unknown, field: string): void {
  if (typeof val !== "string" || val.length === 0) {
    throw new Error(`${field} must be a non-empty string, got: ${JSON.stringify(val)}`);
  }
}

function assertNumber(val: unknown, field: string): void {
  if (typeof val !== "number" || isNaN(val)) {
    throw new Error(`${field} must be a number, got: ${JSON.stringify(val)}`);
  }
}

function assertArray(val: unknown, field: string, minLength = 1): void {
  if (!Array.isArray(val) || val.length < minLength) {
    throw new Error(`${field} must be an array with at least ${minLength} item(s)`);
  }
}

function validateIdeaConcept(c: IdeaConcept): void {
  assertString(c.id, "id");
  assertString(c.title, "title");
  assertString(c.hook, "hook");
  assertString(c.format, "format");
  assertNumber(c.duration_seconds, "duration_seconds");
  assertString(c.narrative_arc.beat_1_setup, "narrative_arc.beat_1_setup");
  assertString(c.narrative_arc.beat_2_tension, "narrative_arc.beat_2_tension");
  assertString(c.narrative_arc.beat_3_payoff, "narrative_arc.beat_3_payoff");
  assertString(c.visual_style, "visual_style");
  assertString(c.target_emotion, "target_emotion");
  assertNumber(c.shot_count, "shot_count");
  assertArray(c.training_patterns_used, "training_patterns_used", 0);
  assertNumber(c.virality_score, "virality_score");
  assertString(c.virality_reasoning, "virality_reasoning");
}

function validateShotPrompt(s: ShotPrompt): void {
  assertString(s.shot_id, "shot_id");
  assertString(s.narrative_beat, "narrative_beat");
  assertNumber(s.duration_seconds, "duration_seconds");
  assertString(s.prompt, "prompt");
  assertString(s.negative_prompt, "negative_prompt");
  assertString(s.aspect_ratio, "aspect_ratio");
  assertString(s.style_preset, "style_preset");
  assertString(s.motion_intensity, "motion_intensity");
}

function validateScenePlan(plan: RemotionScenePlan): void {
  assertString(plan.composition_id, "composition_id");
  assertNumber(plan.fps, "fps");
  assertNumber(plan.total_duration_frames, "total_duration_frames");
  assertString(plan.aspect_ratio, "aspect_ratio");
  assertArray(plan.scenes, "scenes");
  assertString(plan.global_color_grade, "global_color_grade");
  assertString(plan.caption_font, "caption_font");
  assertString(plan.music_mood, "music_mood");
}

function validateCaptionCopy(c: CaptionCopy): void {
  assertString(c.hook_line, "hook_line");
  assertArray(c.body_lines, "body_lines");
  assertString(c.cta, "cta");
  assertArray(c.hashtags, "hashtags", 0);
  assertString(c.caption_style, "caption_style");
}

function validateGeneratedShot(s: GeneratedShot): void {
  assertString(s.shot_id, "shot_id");
  if (typeof s.clip_url !== "string") throw new Error("clip_url must be a string");
  if (typeof s.thumbnail_url !== "string") throw new Error("thumbnail_url must be a string");
  assertNumber(s.duration_seconds, "duration_seconds");
  if (!["success", "failed", "skipped"].includes(s.status)) {
    throw new Error(`status must be success/failed/skipped, got: ${s.status}`);
  }
}

async function runTests(): Promise<void> {
  const results: StageResult[] = [];
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  DRY RUN TEST");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Stage 1: Training data
  try {
    const t = training.getBannedPhrases();
    const hooks = training.getHookPatterns();
    const arcs = training.getNarrativeArcs();
    const vocab = training.getShotVocabulary();
    results.push(
      pass(
        "Training loader",
        `${t.length} banned phrases, ${hooks.length} hooks, ${arcs.length} arcs, ${vocab.lighting.length} lighting terms`
      )
    );
  } catch (err) {
    results.push(fail("Training loader", String(err)));
  }

  // Stage 2: CSV loader — shape + dedup + type/category fields
  try {
    const csv = loadCsvTrainingData(process.cwd());
    const firstRow = csv.examples[0];
    if (!firstRow) throw new Error("CSV loaded 0 rows");
    if (typeof firstRow.type !== "string" || typeof firstRow.category !== "string") {
      throw new Error(`Missing type/category on row: ${JSON.stringify(firstRow)}`);
    }
    const categories = new Set(csv.examples.map((r) => r.category));
    results.push(
      pass(
        "CSV loader",
        `${csv.examples.length} rows · ${categories.size} categories · ` +
          `type="${firstRow.type}" category="${firstRow.category}"`
      )
    );
  } catch (err) {
    results.push(fail("CSV loader", String(err)));
  }

  // Stage 2b: training_loader CSV methods
  try {
    const allPrompts    = training.getAllCsvPrompts();
    const fashionRows   = training.getCsvPromptsByCategory("fashion");
    const randomSample  = training.getRandomCsvPrompts(5, "cinematic");
    if (allPrompts.length === 0) throw new Error("getAllCsvPrompts returned 0 items");
    results.push(
      pass(
        "Training loader CSV methods",
        `getAllCsvPrompts: ${allPrompts.length} | getCsvByCategory(fashion): ${fashionRows.length} | getRandom(5,cinematic): ${randomSample.length}`
      )
    );
    console.log(`\n💉 CSV injection preview (system prompt would include):`);
    randomSample.slice(0, 2).forEach((p, i) =>
      console.log(`  Example ${i + 1}: ${p.slice(0, 80)}...`)
    );
  } catch (err) {
    results.push(fail("Training loader CSV methods", String(err)));
  }

  // Stage 2c: music selector
  try {
    const { selectTrack } = await import("./utils/music_selector");
    const track = selectTrack("cinematic"); // expected to be null (no files yet — that's ok)
    results.push(
      pass(
        "Music selector",
        track ? `Track found: ${track}` : "No cinematic.mp3 on disk — returns null gracefully ✓"
      )
    );
  } catch (err) {
    results.push(fail("Music selector", String(err)));
  }

  // Stage 3: Idea generation (requires valid ANTHROPIC_API_KEY)
  let concepts: IdeaConcept[] = [];
  const hasRealApiKey =
    Boolean(process.env.ANTHROPIC_API_KEY) &&
    process.env.ANTHROPIC_API_KEY !== "your_key_here";

  if (hasRealApiKey) {
    try {
      console.log("💡 Generating ideas (calling Anthropic API)...\n");
      concepts = await generateIdeas(TEST_CONTEXT);
      assertArray(concepts, "concepts", 3);
      for (const c of concepts) validateIdeaConcept(c);
      results.push(pass("Idea generation", `${concepts.length} concepts — ${concepts.map((c) => c.title).join(" | ")}`));
      console.log(formatIdeasForDisplay(concepts));
    } catch (err) {
      results.push(fail("Idea generation", String(err)));
    }
  } else {
    results.push(pass("Idea generation", "SKIPPED — no ANTHROPIC_API_KEY set (add key to .env to test this stage)"));
  }

  // Use mock concept for all downstream stages regardless of API status
  const mockConcept: IdeaConcept = {
    id: "concept_01",
    title: "The Ritual Before Everything",
    hook: "Extreme close-up of steam rising from a ceramic mug on white marble — silence before the day starts",
    format: "Reel",
    duration_seconds: 30,
    narrative_arc: {
      beat_1_setup: "Hands wrap around a warm mug, steam rising, no phone in sight",
      beat_2_tension: "Cut to the outside world — notifications piling up, city noise rising",
      beat_3_payoff: "Back to stillness — one sip, eyes close, the ritual wins",
    },
    visual_style: "golden hour cinematic shallow depth of field",
    target_emotion: "Desire",
    shot_count: 4,
    training_patterns_used: ["sheet1_1", "sheet2_3"],
    virality_score: 8,
    virality_reasoning: "challenges the assumption that productivity starts at the screen — counterintuitive positioning of doing nothing as the power move",
  };

  if (concepts.length === 0) concepts = [mockConcept];
  const chosen = concepts[0];

  // Stage 4: Prompt writing (using mocked Anthropic — skip actual API call in full isolation)
  // We build a minimal valid set of shots and scene plan manually to test downstream stages
  const mockShots: ShotPrompt[] = [
    {
      shot_id: "shot_01",
      narrative_beat: "setup",
      duration_seconds: 4,
      prompt: "Close-up of ceramic mug steaming on white marble surface, warm morning light, slow push-in, calm minimalist mood, cinematic",
      negative_prompt: "blurry, overexposed, amateur, shaky, text on screen",
      aspect_ratio: "9:16",
      style_preset: "cinematic",
      motion_intensity: "subtle",
    },
    {
      shot_id: "shot_02",
      narrative_beat: "tension",
      duration_seconds: 4,
      prompt: "Hands wrapping around mug, golden rim light, rack focus foreground to background, calm warmth, photorealistic",
      negative_prompt: "blurry, overexposed, amateur, shaky, text on screen",
      aspect_ratio: "9:16",
      style_preset: "photorealistic",
      motion_intensity: "subtle",
    },
    {
      shot_id: "shot_03",
      narrative_beat: "payoff",
      duration_seconds: 4,
      prompt: "Face in soft morning light, steam rising, static locked-off portrait, peaceful minimalist, ultra-realistic",
      negative_prompt: "blurry, overexposed, amateur, shaky, text on screen",
      aspect_ratio: "9:16",
      style_preset: "photorealistic",
      motion_intensity: "subtle",
    },
    {
      shot_id: "shot_04",
      narrative_beat: "broll",
      duration_seconds: 3,
      prompt: "Coffee beans scattered on white surface, overhead looking down, warm natural light, minimal mood, cinematic",
      negative_prompt: "blurry, overexposed, amateur, shaky, text on screen",
      aspect_ratio: "9:16",
      style_preset: "cinematic",
      motion_intensity: "subtle",
    },
  ];

  const mockScenePlan: RemotionScenePlan = {
    composition_id: "final_video",
    fps: 30,
    total_duration_frames: 450,
    aspect_ratio: "9:16",
    global_color_grade: "warm_cinematic",
    caption_font: "Inter Bold",
    music_mood: "lo-fi",
    scenes: mockShots.map((s, i) => ({
      scene_id: `scene_0${i + 1}`,
      from_frame: i * (s.duration_seconds * 30),
      duration_frames: s.duration_seconds * 30,
      clip_source: s.shot_id,
      transition_in: i === 0 ? "fade" : "cut",
      transition_out: i === mockShots.length - 1 ? "fade" : "cut",
      caption: {
        text: ["Morning starts here.", "Before the noise hits.", "This is your signal.", "Stay tuned."][i],
        style: (["bold_center", "lower_third", "lower_third", "bold_center"] as const)[i],
        appear_at_frame: 10,
        disappear_at_frame: s.duration_seconds * 30 - 15,
      },
      broll_overlay: { enabled: false, type: "none" },
      audio_note: i === 0 ? "fade in" : i === mockShots.length - 1 ? "fade out" : "steady",
    })),
  };

  const mockCaption: CaptionCopy = {
    hook_line: "You're rushing through the one thing that shouldn't be rushed.",
    body_lines: [
      "The first sip isn't just caffeine — it's the last quiet moment before everything starts.",
      "Most people are already three tabs deep before the mug hits the counter.",
      "One minute of stillness changes the next eight hours.",
    ],
    cta: "Save this. Watch it tomorrow morning before you open anything else.",
    hashtags: ["#morningritual", "#slowliving", "#coffeeculture", "#minimalist", "#intentionalliving"],
    caption_style: "storytelling",
  };

  // Validate shapes
  try {
    for (const s of mockShots) validateShotPrompt(s);
    results.push(pass("Shot prompt validation", `${mockShots.length} shots validated`));
  } catch (err) {
    results.push(fail("Shot prompt validation", String(err)));
  }

  try {
    validateScenePlan(mockScenePlan);
    results.push(pass("Scene plan validation", `${mockScenePlan.scenes.length} scenes, ${mockScenePlan.total_duration_frames} frames`));
  } catch (err) {
    results.push(fail("Scene plan validation", String(err)));
  }

  try {
    validateCaptionCopy(mockCaption);
    results.push(pass("Caption copy validation", `hook: "${mockCaption.hook_line.slice(0, 50)}..."`));
  } catch (err) {
    results.push(fail("Caption copy validation", String(err)));
  }

  // Stage 5: Mock Higgsfield
  let generatedShots: GeneratedShot[] = [];
  try {
    const mockClient = new MockHiggsFieldClient();
    generatedShots = await mockClient.generateAllShots(mockShots);
    for (const s of generatedShots) validateGeneratedShot(s);
    results.push(pass("Mock Higgsfield", `${generatedShots.length} shots, all status: ${generatedShots.map((s) => s.status).join(", ")}`));
  } catch (err) {
    results.push(fail("Mock Higgsfield", String(err)));
  }

  // Stage 6: Scene config write
  try {
    const configPath = writeSceneConfig(mockScenePlan, generatedShots);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8")) as RemotionScenePlan;
    if (!written.scenes || written.scenes.length === 0) throw new Error("Written config has no scenes");
    results.push(pass("Scene config write", `Written to ${path.relative(process.cwd(), configPath)} — ${written.scenes.length} scenes`));
  } catch (err) {
    results.push(fail("Scene config write", String(err)));
  }

  // Stage 7: ProductionPackage shape
  try {
    const pkg: ProductionPackage = {
      concept: chosen,
      shots: generatedShots,
      scene_plan: mockScenePlan,
      caption: mockCaption,
      video_output_path: "./output/dry_run.mp4",
    };
    if (!pkg.video_output_path) throw new Error("video_output_path missing");
    results.push(pass("ProductionPackage shape", "All fields present and typed correctly"));
  } catch (err) {
    results.push(fail("ProductionPackage shape", String(err)));
  }

  printReport(results);
}

function printReport(results: StageResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  DRY RUN REPORT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    console.log(`${icon} ${r.stage}`);
    console.log(`  ${r.detail}\n`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  ${passed}/${total} stages passed`);
  if (passed === total) {
    console.log("  ✓ Studio is ready to use. Run: npm start");
  } else {
    console.log("  ✗ Fix the failing stages above before running the studio.");
    process.exit(1);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
