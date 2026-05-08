/**
 * Non-interactive end-to-end demo run.
 *
 * Pipeline:
 *   Claude API  → concept + script generation
 *   Ollama      → scene descriptions (USE_OLLAMA=true in .env)
 *   Remotion    → video composition + render
 *
 * Usage: npx ts-node src/demo_run.ts
 */

import "dotenv/config";
import type { SessionContext, IdeaConcept, ShotPrompt, GeneratedShot, RemotionScenePlan, CaptionCopy } from "./types";
import { generateIdeas, formatIdeasForDisplay } from "./agents/idea_generator";
import { writePrompts } from "./agents/prompt_writer";
import { writeSceneConfig, renderRemotionOnly } from "./integrations/remotion_runner";
import { MockOllamaClient } from "./utils/mock_ollama";

// ── Preset session — change these to test different topics ─────────────────────
const SESSION: SessionContext = {
  topic: "specialty cold brew coffee subscription box",
  brand: "Drift Coffee — calm, minimal, modern",
  platform: "Instagram",
  goal: "Awareness",
  mood: "cinematic",
};

async function run() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  DEMO RUN — Ollama + Remotion");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Topic   : ${SESSION.topic}`);
  console.log(`Platform: ${SESSION.platform}`);
  console.log(`Mode    : Claude (concepts) + Ollama (scenes) + Remotion (render)\n`);

  // ── Step 1: Claude generates concepts + scripts ─────────────────────────────
  console.log("💡 Step 1 — Generating concepts with Claude...\n");
  let ideas: IdeaConcept[];
  try {
    ideas = await generateIdeas(SESSION);
  } catch (err) {
    console.error(`✗ Concept generation failed: ${String(err)}`);
    process.exit(1);
  }

  console.log(formatIdeasForDisplay(ideas));

  // Auto-select the highest virality concept
  const chosen = ideas.reduce((best, c) =>
    c.virality_score > best.virality_score ? c : best
  );
  console.log(`\n✓ Auto-selected concept: "${chosen.title}" (virality ${chosen.virality_score}/10)\n`);

  // ── Step 2: Claude writes shot prompts + scene plan + caption copy ──────────
  console.log("✍  Step 2 — Writing shot prompts + scene plan with Claude...\n");
  let shots: ShotPrompt[];
  let scenePlan: RemotionScenePlan;
  let caption: CaptionCopy;
  try {
    ({ shots, scenePlan, caption } = await writePrompts(chosen, SESSION, { skipConfirmation: true }));
  } catch (err) {
    if (String(err).includes("EDIT_REQUESTED")) {
      console.log("EDIT_REQUESTED — exiting demo (not possible with skipConfirmation).");
      process.exit(0);
    }
    console.error(`✗ Prompt writing failed: ${String(err)}`);
    process.exit(1);
  }

  // ── Step 3: Ollama generates scene descriptions (free, local) ──────────────
  console.log("\n🤖 Step 3 — Ollama generating scene descriptions...\n");
  const ollamaClient = new MockOllamaClient();
  let generatedShots: GeneratedShot[];
  try {
    generatedShots = await ollamaClient.generateAllShots(shots);
  } catch (err) {
    console.error(`✗ Ollama generation failed: ${String(err)}`);
    process.exit(1);
  }

  // ── Step 4: Write scene config (placeholder clips for Remotion) ─────────────
  console.log("\n📐 Step 4 — Writing Remotion scene config...\n");
  const configPath = writeSceneConfig(scenePlan, generatedShots);

  // ── Step 5: Remotion renders the composition ────────────────────────────────
  console.log("\n🎬 Step 5 — Remotion rendering...\n");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let videoPath: string;
  try {
    videoPath = await renderRemotionOnly(scenePlan, timestamp);
  } catch (err) {
    console.error(`✗ Remotion render failed: ${String(err)}`);
    console.log("\n⚠  Remotion render error — scene config is ready at:");
    console.log(`   ${configPath}`);
    console.log("   Open Remotion Studio to preview: npm run remotion\n");
    process.exit(1);
  }

  // ── Delivery ─────────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ DEMO RUN COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Concept : ${chosen.title}
Video   : ${videoPath}

CAPTION:
${caption.hook_line}
${caption.body_lines.join("\n")}
${caption.cta}
${caption.hashtags.join(" ")}

Scene config → ${configPath}
Preview in Remotion Studio → npm run remotion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

run().catch((err) => {
  console.error("\n✗ Demo run crashed:", String(err));
  process.exit(1);
});
