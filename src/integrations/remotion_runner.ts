import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type { RemotionScenePlan, GeneratedShot, RemotionScene } from "../types";

const REMOTION_ENTRY     = path.resolve("./remotion/Root.tsx");
const REMOTION_PUBLIC_DIR = path.resolve("./remotion/public");

// scene-config.json — shared dev/studio file, kept in sync with the last combined render
const SCENE_CONFIG_PATH = path.resolve("./remotion/scene-config.json");

// scene-config-combined.json — written by writeSceneConfig with real clip URLs.
// renderCombined and re-render commands use this path so renderRemotionOnly can't
// overwrite it (renderRemotionOnly writes to SCENE_CONFIG_PATH only).
const COMBINED_CONFIG_PATH = path.resolve("./remotion/scene-config-combined.json");

const OUTPUT_DIR = path.resolve(process.env.REMOTION_OUTPUT_DIR ?? "./output");

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Normalises caption appear/disappear frames to be RELATIVE to the scene start.
 *
 * The AI is instructed to output relative frames, but occasionally returns
 * absolute frame numbers (e.g. scene 3 at from_frame=240 gets appear_at_frame=250).
 * Inside a Remotion <Sequence>, useCurrentFrame() resets to 0 at the sequence
 * start, so absolute values must be converted.
 *
 * Detection: for scenes that don't start at frame 0, absolute frames will be
 * >= fromFrame. Relative frames (per AI instructions: appear≈10) will always
 * be much smaller than fromFrame for any scene past the first.
 * For scene_01 (fromFrame=0) absolute === relative, so no conversion is needed.
 */
function normaliseCaption(
  caption: RemotionScene["caption"],
  fromFrame: number,
  durationFrames: number
): RemotionScene["caption"] {
  if (fromFrame === 0) return caption;
  if (caption.appear_at_frame >= fromFrame) {
    return {
      ...caption,
      appear_at_frame:    Math.max(0, Math.min(caption.appear_at_frame    - fromFrame, durationFrames - 1)),
      disappear_at_frame: Math.max(0, Math.min(caption.disappear_at_frame - fromFrame, durationFrames - 1)),
    };
  }
  return caption;
}

/**
 * Validates that a RemotionScenePlan is internally consistent before writing.
 * Logs a warning for each issue found; does not throw.
 */
export function validateSceneConfig(plan: RemotionScenePlan): void {
  const ids = plan.scenes.map((s) => s.scene_id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    console.warn(`⚠  Duplicate scene_ids detected: ${dupes.join(", ")}`);
  }

  let expected = 0;
  for (const scene of plan.scenes) {
    if (scene.from_frame !== expected) {
      console.warn(
        `⚠  Scene ${scene.scene_id}: from_frame=${scene.from_frame} expected ${expected} (gap or overlap)`
      );
    }
    expected += scene.duration_frames;
  }

  const computedTotal = plan.scenes.reduce((sum, s) => sum + s.duration_frames, 0);
  if (computedTotal !== plan.total_duration_frames) {
    console.warn(
      `⚠  total_duration_frames=${plan.total_duration_frames} but scene durations sum to ${computedTotal}`
    );
  }
}

/**
 * Merges GeneratedShot clip_urls into the RemotionScenePlan, skips failed shots,
 * normalises caption frame numbers to be relative, and returns the config path.
 */
export function writeSceneConfig(
  plan: RemotionScenePlan,
  shots: GeneratedShot[]
): string {
  const successfulShots = new Map(
    shots.filter((s) => s.status === "success").map((s) => [s.shot_id, s])
  );

  const mergedScenes: RemotionScene[] = [];
  let currentFrame = 0;

  for (const scene of plan.scenes) {
    // Normalise clip_source: strip common AI-added prefixes like "higgsfield_"
    const normalisedSource = scene.clip_source.replace(/^higgsfield_/, "");
    const shot = successfulShots.get(normalisedSource) ?? successfulShots.get(scene.clip_source);
    if (!shot) {
      console.warn(`⚠  Scene ${scene.scene_id}: no successful shot for clip_source="${scene.clip_source}" — scene dropped`);
      continue;
    }

    mergedScenes.push({
      ...scene,
      from_frame: currentFrame,
      clip_url: shot.clip_url,
      caption: normaliseCaption(scene.caption, scene.from_frame, scene.duration_frames),
    });
    currentFrame += scene.duration_frames;
  }

  const totalSeconds = Math.round(currentFrame / plan.fps);
  const finalPlan: RemotionScenePlan = {
    ...plan,
    scenes: mergedScenes,
    total_duration_frames: currentFrame,
  };

  validateSceneConfig(finalPlan);

  console.log("  Merged scenes:");
  for (const s of mergedScenes) {
    console.log(
      `    ${s.scene_id}  from=${s.from_frame}  dur=${s.duration_frames}  clip=${s.clip_url ?? "(placeholder)"}`
    );
  }

  fs.mkdirSync(path.dirname(SCENE_CONFIG_PATH), { recursive: true });

  // Write the authoritative combined config (real clip URLs) to a dedicated path.
  // This is what renderCombined and re-render commands read from.
  fs.writeFileSync(COMBINED_CONFIG_PATH, JSON.stringify(finalPlan, null, 2));

  // Also sync scene-config.json for Remotion Studio dev preview.
  fs.writeFileSync(SCENE_CONFIG_PATH, JSON.stringify(finalPlan, null, 2));

  console.log(
    `✓ Scene config written → remotion/scene-config-combined.json (${mergedScenes.length} scenes, ${totalSeconds}s total)`
  );

  return COMBINED_CONFIG_PATH;
}

function renderProgressBar(current: number, total: number): string {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `  Frame ${current}/${total}  [${bar}] ${pct}%`;
}

/**
 * Writes a props file that Remotion's --props flag understands.
 * Root.tsx has defaultProps={{ config }}, so we wrap the plan in { config: plan }.
 */
function writePropsFile(plan: RemotionScenePlan, propsPath: string): void {
  fs.writeFileSync(propsPath, JSON.stringify({ config: plan }, null, 2));
}

/** Runs the Remotion render for a given scene plan and returns the output file path. */
export async function render(
  configPath: string,
  outputPath?: string
): Promise<string> {
  ensureOutputDir();

  // Read the plan from the config file, wrap it for --props
  const plan = JSON.parse(fs.readFileSync(configPath, "utf-8")) as RemotionScenePlan;

  // Sync scene-config.json for Remotion Studio — only when rendering with real clip URLs
  // so that renderRemotionOnly (placeholder) never clobbers the combined config.
  if (plan.scenes.some((s) => Boolean(s.clip_url))) {
    fs.writeFileSync(SCENE_CONFIG_PATH, JSON.stringify(plan, null, 2));
  }

  // Write wrapped props file for CLI --props flag
  const propsPath = configPath.replace(/\.json$/, "-props.json");
  writePropsFile(plan, propsPath);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const resolvedOutput = outputPath ?? path.join(OUTPUT_DIR, `final_video_${timestamp}.mp4`);

  return new Promise((resolve, reject) => {
    const args = [
      "remotion",
      "render",
      REMOTION_ENTRY,                        // entry point with registerRoot()
      "FinalVideo",                          // composition ID (positional)
      resolvedOutput,                        // output path (positional)
      `--props=${propsPath}`,
      `--public-dir=${REMOTION_PUBLIC_DIR}`, // explicit public dir for CLI render
      "--codec=h264",
    ];

    console.log("\n🎬 Remotion rendering...");

    const proc = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"] });
    let totalFrames = 0;
    let stderrOutput = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/Frame (\d+)\/(\d+)/);
      if (match) {
        const current = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        totalFrames = total;
        process.stdout.write(`\r${renderProgressBar(current, total)}`);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrOutput += text;
      const match = text.match(/Frame (\d+)\/(\d+)/);
      if (match) {
        const current = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        totalFrames = total;
        process.stdout.write(`\r${renderProgressBar(current, total)}`);
      }
    });

    proc.on("close", (code) => {
      if (totalFrames > 0) {
        process.stdout.write(`\r${renderProgressBar(totalFrames, totalFrames)}\n`);
      }
      if (code === 0) {
        console.log(`✓ Render complete → ${resolvedOutput}`);
        resolve(resolvedOutput);
      } else {
        reject(new Error(`Remotion render failed (exit ${code}):\n${stderrOutput}`));
      }
    });

    proc.on("error", (err) => {
      if (String(err).includes("ENOENT")) {
        reject(
          new Error(
            "Remotion CLI not found. Run: npm install && npx remotion studio remotion/Root.tsx"
          )
        );
      } else {
        reject(err);
      }
    });
  });
}

/** Renders the video in multiple aspect ratio variants and returns all output paths. */
export async function renderVariants(
  configPath: string,
  formats: ("9:16" | "1:1" | "16:9")[]
): Promise<string[]> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const basePlan = JSON.parse(fs.readFileSync(configPath, "utf-8")) as RemotionScenePlan;
  const outputPaths: string[] = [];

  for (const format of formats) {
    const formatSlug = format.replace(":", "x");
    const variantPath = path.join(OUTPUT_DIR, `final_video_${formatSlug}_${timestamp}.mp4`);

    const [width, height] = getResolution(format);
    const variantConfig: RemotionScenePlan = { ...basePlan, aspect_ratio: format };
    // Build variant config path alongside the source config, not via fragile string replace
    const variantConfigPath = path.join(
      path.dirname(configPath),
      `scene-config-${formatSlug}.json`
    );

    fs.writeFileSync(variantConfigPath, JSON.stringify(variantConfig, null, 2));
    console.log(`\n▶ Rendering ${format} variant (${width}×${height})...`);

    const outputPath = await render(variantConfigPath, variantPath);
    outputPaths.push(outputPath);
  }

  return outputPaths;
}

function getResolution(format: "9:16" | "1:1" | "16:9"): [number, number] {
  switch (format) {
    case "9:16": return [1080, 1920];
    case "1:1": return [1080, 1080];
    case "16:9": return [1920, 1080];
  }
}

/**
 * Writes a Remotion-only scene config using placeholder clips (no Higgsfield).
 * Writes to scene-config.json so Root.tsx static import stays in sync.
 */
export function writeRemotionOnlyConfig(plan: RemotionScenePlan): string {
  let frame = 0;
  const scenesWithPlaceholders: RemotionScene[] = plan.scenes.map((scene) => {
    const originalFrom = scene.from_frame;
    const out = {
      ...scene,
      clip_url: "",
      from_frame: frame,
      caption: normaliseCaption(scene.caption, originalFrom, scene.duration_frames),
    };
    frame += scene.duration_frames;
    return out;
  });

  const finalPlan: RemotionScenePlan = {
    ...plan,
    scenes: scenesWithPlaceholders,
    total_duration_frames: frame,
  };

  fs.mkdirSync(path.dirname(SCENE_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(SCENE_CONFIG_PATH, JSON.stringify(finalPlan, null, 2));
  return SCENE_CONFIG_PATH;
}

/**
 * Renders a Remotion-only video (no Higgsfield clips — uses placeholders).
 * Returns the output path.
 */
export async function renderRemotionOnly(
  plan: RemotionScenePlan,
  timestamp: string
): Promise<string> {
  const configPath = writeRemotionOnlyConfig(plan);
  const outputPath = path.join(OUTPUT_DIR, `remotion_only_${timestamp}.mp4`);
  console.log("\n🎬 Rendering Remotion-only (placeholder clips)...");
  return render(configPath, outputPath);
}

/**
 * Renders the combined video: Higgsfield clips injected into the Remotion composition.
 * This is the full production output.
 */
export async function renderCombined(
  configPath: string,
  timestamp: string
): Promise<string> {
  const outputPath = path.join(OUTPUT_DIR, `combined_${timestamp}.mp4`);
  console.log("\n🎬 Rendering combined (Higgsfield + Remotion)...");
  return render(configPath, outputPath);
}
