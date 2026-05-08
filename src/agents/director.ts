import path from "path";
import readline from "readline";
import type { SessionContext, IdeaConcept, ProductionPackage } from "../types";
import { training } from "../utils/training_loader";
import { generateIdeas, formatIdeasForDisplay } from "./idea_generator";
import { writePrompts } from "./prompt_writer";
import { selectTrack } from "../utils/music_selector";
import {
  writeSceneConfig,
  render,
  renderVariants,
  renderRemotionOnly,
  renderCombined,
} from "../integrations/remotion_runner";
import { renderHiggsFieldOnly } from "../integrations/ffmpeg_concat";
import { HiggsFieldMCPClient, MockHiggsFieldClient } from "../integrations/higgsfield";
import { MockOllamaClient } from "../utils/mock_ollama";

// ─── Video client selector ────────────────────────────────────────────────────
// Priority: USE_OLLAMA=true → Ollama | HIGGSFIELD_MCP_URL set → Higgsfield MCP | else Mock

function getVideoClient() {
  if (process.env.USE_OLLAMA === "true") {
    console.log("✓ Video client: Ollama (USE_OLLAMA=true)");
    return new MockOllamaClient();
  }

  const hasMcpUrl = Boolean(
    process.env.HIGGSFIELD_MCP_URL &&
    process.env.HIGGSFIELD_MCP_URL !== "https://your-higgsfield-mcp-endpoint"
  );

  if (hasMcpUrl) {
    return new HiggsFieldMCPClient();
  }

  console.log("✓ Video client: Higgsfield mock (set HIGGSFIELD_MCP_URL to use production)");
  return new MockHiggsFieldClient();
}

// ─── CLI helpers ──────────────────────────────────────────────────────────────

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function waitForCommand(
  prompt: string,
  validCommands: string[]
): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const query = (): void => {
      rl.question(prompt, (answer) => {
        const trimmed = answer.trim().toUpperCase();
        if (validCommands.includes(trimmed)) {
          rl.close();
          resolve(trimmed);
        } else {
          console.log(`Valid commands: ${validCommands.join(" / ")}`);
          query();
        }
      });
    };
    query();
  });
}

async function selectConcept(
  ideas: IdeaConcept[],
  context: SessionContext
): Promise<IdeaConcept> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const select = async (): Promise<IdeaConcept> => {
    const answer  = await ask(rl, "\n> ");
    const trimmed = answer.trim().toUpperCase();

    if (trimmed === "REMIX") {
      rl.close();
      console.log("\n🔄 Generating experimental variations...\n");
      const remixed = await generateIdeas(
        context,
        "Be more experimental — push further from the obvious angle. Challenge category conventions."
      );
      console.log(formatIdeasForDisplay(remixed));
      return selectConcept(remixed, context);
    }

    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= ideas.length) {
      rl.close();
      return ideas[num - 1];
    }

    console.log(`Enter 1–${ideas.length} or type REMIX.`);
    return select();
  };

  return select();
}

// ─── Main session ─────────────────────────────────────────────────────────────

export async function runSession(context: SessionContext): Promise<ProductionPackage> {
  // Step 1: Generate ideas
  console.log("\n💡 Generating concepts...\n");
  let ideas: IdeaConcept[];
  try {
    ideas = await generateIdeas(context);
  } catch (err) {
    throw new Error(`Idea generation failed: ${String(err)}`);
  }

  console.log(formatIdeasForDisplay(ideas));

  // Step 2: Select concept
  const chosen = await selectConcept(ideas, context);
  console.log(`\n✓ Selected: ${chosen.title}\n`);

  // Step 3: Write prompts (prints brief, waits for GO)
  let shots, scenePlan, caption;
  try {
    ({ shots, scenePlan, caption } = await writePrompts(chosen, context));
  } catch (err) {
    if (String(err).includes("EDIT_REQUESTED")) {
      console.log("\n↩  Restarting session...\n");
      return runSession(context);
    }
    throw new Error(`Prompt writing failed: ${String(err)}`);
  }

  const timestamp   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const videoClient = getVideoClient();

  // Step 4a: Generate video shots via Higgsfield
  console.log("\n🎥 Starting video production...\n");
  let generatedShots;
  try {
    generatedShots = await videoClient.generateAllShots(shots);
  } catch (err) {
    throw new Error(`Video production failed: ${String(err)}`);
  }

  const successCount = generatedShots.filter((s) => s.status === "success").length;
  console.log(`\n✓ ${successCount}/${generatedShots.length} shots generated`);

  // Step 4b: Apply ElevenLabs lipsync through Higgsfield.
  // Each shot's voiceover text comes from the matching script beat (setup/tension/payoff).
  // Audio is baked directly into the clip — Remotion plays it back via <Video>.
  // B-roll shots and shots without a matching script beat are left silent.
  let voiceoverDesc = "none";
  if (process.env.ENABLE_VOICEOVER === "true" && chosen.script) {
    console.log("\n🎙  Applying ElevenLabs lipsync via Higgsfield...");
    try {
      generatedShots = await videoClient.applyLipsyncToShots(generatedShots, shots, chosen.script);
      voiceoverDesc  = `ElevenLabs lipsync via Higgsfield (voice: ${process.env.ELEVENLABS_VOICE_ID ?? "Rachel"})`;
      console.log("✓ Lipsync complete");
    } catch (err) {
      console.warn(`⚠  Lipsync skipped: ${String(err)}`);
    }
  }

  // Step 5: Write scene config — returns path to combined config with real clip URLs
  let configPath: string;
  try {
    configPath = writeSceneConfig(scenePlan, generatedShots);
  } catch (err) {
    throw new Error(`Scene config failed: ${String(err)}`);
  }

  // Select background music track
  const musicPath = selectTrack(scenePlan.music_mood);
  const musicDesc = musicPath
    ? `${path.basename(musicPath)} at 30%`
    : "none (add music files to assets/music/)";

  // Build audio description for delivery summary
  const hasLipsync = voiceoverDesc !== "none";
  const audioDesc  = hasLipsync && musicPath
    ? `${voiceoverDesc} + ${musicDesc}`
    : hasLipsync ? voiceoverDesc
    : musicPath  ? musicDesc
    : "none (add music files to assets/music/)";

  // Step 6: Render all three output variants
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Rendering 3 output variants...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Output 1: Higgsfield clips (audio already baked in by lipsync) + optional background music
  let higgsOnlyPath = "";
  try {
    const result = await renderHiggsFieldOnly(
      generatedShots, timestamp, undefined, musicPath ?? undefined
    );
    higgsOnlyPath = result.outputPath;
  } catch (err) {
    console.warn(`⚠  Clips-only render failed: ${String(err)}`);
  }

  // Output 2: Remotion-only (animated captions + placeholder clips)
  // NOTE: renderRemotionOnly writes to scene-config.json but render() will NOT
  // overwrite COMBINED_CONFIG_PATH — configPath (combined) is safe to use after this.
  let remotionOnlyPath = "";
  try {
    remotionOnlyPath = await renderRemotionOnly(scenePlan, timestamp);
  } catch (err) {
    console.warn(`⚠  Remotion-only render failed: ${String(err)}`);
  }

  // Output 3: Combined — real clips inside Remotion composition (captions + transitions)
  // Uses configPath = scene-config-combined.json (not overwritten by Output 2).
  let combinedPath = "";
  try {
    combinedPath = await renderCombined(configPath, timestamp);
  } catch (err) {
    console.warn(`⚠  Combined render failed: ${String(err)}`);
  }

  const videoPath = combinedPath || remotionOnlyPath || higgsOnlyPath;
  if (!videoPath) throw new Error("All three renders failed.");

  // Step 7: Package
  const pkg: ProductionPackage = {
    concept:    chosen,
    shots:      generatedShots,
    scene_plan: {
      ...scenePlan,
      scenes: scenePlan.scenes.map((s, i) => ({
        ...s,
        clip_url: generatedShots[i]?.clip_url,
      })),
    },
    caption,
    video_output_path: videoPath,
  };

  printDelivery(pkg, higgsOnlyPath, remotionOnlyPath, combinedPath, audioDesc, configPath);
  await handlePostDelivery(pkg, configPath, context);

  return pkg;
}

// ─── Delivery summary ─────────────────────────────────────────────────────────

function printDelivery(
  pkg: ProductionPackage,
  higgsOnlyPath: string,
  remotionOnlyPath: string,
  combinedPath: string,
  audioDesc: string,
  configPath: string
): void {
  const successShots = pkg.shots.filter((s) => s.status === "success");
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PRODUCTION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Duration  : ${pkg.concept.duration_seconds}s · 9:16 · H264
Shots used: ${successShots.length}/${pkg.shots.length} generated
Audio     : ${audioDesc}

OUTPUT 1 — Clips only (FFmpeg concat + audio):
  ${higgsOnlyPath || "⚠ failed"}

OUTPUT 2 — Remotion only (layout + captions, placeholder clips):
  ${remotionOnlyPath || "⚠ failed"}

OUTPUT 3 — Combined (real clips inside Remotion composition):
  ${combinedPath || "⚠ failed"}

CAPTION COPY (ready to paste):
${pkg.caption.hook_line}
${pkg.caption.body_lines.join("\n")}
${pkg.caption.cta}
${pkg.caption.hashtags.join(" ")}

CLIP URLS (raw):
${successShots.map((s) => `  ${s.shot_id} → ${s.clip_url}`).join("\n")}

SCENE CONFIG (for re-renders):
  ${configPath}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
What next?
  RECUT   → adjust timing/transitions and re-render
  RESIZE  → export in 1:1 and 16:9 as well
  RETRY   → regenerate failed shots
  NEW     → start over with a new topic`);
}

// ─── Post-delivery ────────────────────────────────────────────────────────────

async function handlePostDelivery(
  pkg: ProductionPackage,
  configPath: string,
  context: SessionContext
): Promise<void> {
  const command = await waitForCommand("\n> ", ["RECUT", "RESIZE", "RETRY", "NEW"]);

  if (command === "RECUT") {
    console.log("\n✂  Re-rendering with current scene config...");
    try {
      await render(configPath);
    } catch (err) {
      console.error(`✗ Re-render failed: ${String(err)}`);
    }
    await handlePostDelivery(pkg, configPath, context);
  }

  if (command === "RESIZE") {
    console.log("\n📐 Rendering all format variants...");
    try {
      const paths = await renderVariants(configPath, ["9:16", "1:1", "16:9"]);
      console.log(`\n✓ Variants complete:\n${paths.map((p) => `  ${p}`).join("\n")}`);
    } catch (err) {
      console.error(`✗ Variant render failed: ${String(err)}`);
    }
    await handlePostDelivery(pkg, configPath, context);
  }

  if (command === "RETRY") {
    const failedShots = pkg.shots.filter((s) => s.status !== "success");
    if (failedShots.length === 0) {
      console.log("✓ No failed shots to retry.");
      await handlePostDelivery(pkg, configPath, context);
      return;
    }
    console.log(`\n🔄 Retrying ${failedShots.length} failed shot(s)...`);
    const videoClient   = getVideoClient();
    const retriedShots  = pkg.shots.slice();
    for (const failed of failedShots) {
      const retried = await videoClient.generateAllShots([
        {
          shot_id:          failed.shot_id,
          narrative_beat:   "broll",
          duration_seconds: failed.duration_seconds || 4,
          prompt:           `Simple scene for ${pkg.concept.title} — ${pkg.concept.visual_style}`,
          negative_prompt:  "blurry, overexposed, amateur, shaky, text on screen",
          aspect_ratio:     "9:16",
          style_preset:     "cinematic",
          motion_intensity: "subtle",
        },
      ]);
      const i = retriedShots.findIndex((s) => s.shot_id === failed.shot_id);
      if (i !== -1) retriedShots[i] = retried[0];
    }
    const newConfigPath = writeSceneConfig(pkg.scene_plan, retriedShots);
    await render(newConfigPath);
    await handlePostDelivery(pkg, newConfigPath, context);
  }

  if (command === "NEW") {
    console.log("\n🔄 Starting new session...\n");
    const newContext = await collectSessionInputs();
    await runSession(newContext);
  }
}

// ─── Session setup ────────────────────────────────────────────────────────────

export async function collectSessionInputs(): Promise<SessionContext> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Session Setup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const topic = await ask(rl, "Topic (required): ");
  if (!topic.trim()) throw new Error("Topic is required — cannot be empty.");

  const brand     = await ask(rl, "Brand name/tone (optional, Enter to skip): ");
  const platform  = await ask(rl, "Platform [Instagram/TikTok/YouTube Shorts/LinkedIn] (optional): ");
  const goal      = await ask(rl, "Goal [Awareness/Sales/Engagement/Education] (optional): ");
  const mood      = await ask(rl, "Mood [calm/hype/cinematic/raw/luxury] (optional): ");
  const reference = await ask(rl, "Reference creator or aesthetic (optional): ");

  rl.close();

  return {
    topic:     topic.trim(),
    brand:     brand.trim()     || undefined,
    platform:  platform.trim()  || undefined,
    goal:      goal.trim()      || undefined,
    mood:      mood.trim()      || undefined,
    reference: reference.trim() || undefined,
  };
}

export function boot(): void {
  console.log("\n🎬 Social Media Studio — Ready");
  console.log(`✓ Training loaded from training_prompts.json\n`);
}
