/**
 * Pitchworx — Custom Professional PPT Design Agency
 *
 * Non-interactive production run using:
 *   Claude API  → concept + script generation
 *   Ollama      → scene descriptions (local, free)
 *   Remotion    → video composition + render
 *
 * Usage: npx ts-node src/pitchworx_run.ts
 */

import "dotenv/config";
import type {
  SessionContext,
  IdeaConcept,
  ShotPrompt,
  GeneratedShot,
  RemotionScenePlan,
  CaptionCopy,
} from "./types";
import { generateIdeas, formatIdeasForDisplay } from "./agents/idea_generator";
import { writePrompts } from "./agents/prompt_writer";
import { writeSceneConfig, renderRemotionOnly } from "./integrations/remotion_runner";
import { HiggsFieldMCPClient, MockHiggsFieldClient } from "./integrations/higgsfield";
import { MockOllamaClient } from "./utils/mock_ollama";

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
    console.log("✓ Video client: Higgsfield MCP");
    return new HiggsFieldMCPClient();
  }
  console.log("✓ Video client: Higgsfield mock (no MCP URL set)");
  return new MockHiggsFieldClient();
}

// ── Session context ────────────────────────────────────────────────────────────

const SESSION: SessionContext = {
  topic:    "custom professional PowerPoint design — Pitchworx turns raw ideas into boardroom-ready decks",
  brand:    "Pitchworx — premium, precise, corporate-confident. We make your pitch impossible to ignore.",
  platform: "Instagram",
  goal:     "Awareness",
  mood:     "luxury",
  reference: "high-end brand films, clean motion graphics, Cannes Lions B2B advertising aesthetic",
};

// ── Run ────────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  PITCHWORX — Marketing Video Run");
  console.log("  Custom Professional PPT Design Agency");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Topic   : ${SESSION.topic}`);
  console.log(`Platform: ${SESSION.platform}`);
  console.log(`Mood    : ${SESSION.mood}`);
  console.log(`Mode    : Claude (concepts) + Ollama (scenes) + Remotion (render)\n`);

  // ── Step 1: Claude generates concepts ──────────────────────────────────────
  console.log("💡 Step 1 — Claude generating Pitchworx concepts...\n");
  let ideas: IdeaConcept[];
  try {
    ideas = await generateIdeas(SESSION);
  } catch (err) {
    console.error(`✗ Concept generation failed: ${String(err)}`);
    process.exit(1);
  }

  console.log(formatIdeasForDisplay(ideas));

  // Auto-select highest virality
  const chosen = ideas.reduce((best, c) =>
    c.virality_score > best.virality_score ? c : best
  );
  console.log(`\n✓ Auto-selected: "${chosen.title}" (virality ${chosen.virality_score}/10)\n`);

  // ── Step 2: Claude writes all shot prompts ──────────────────────────────────
  console.log("✍  Step 2 — Writing shot prompts + scene plan...\n");
  let shots: ShotPrompt[];
  let scenePlan: RemotionScenePlan;
  let caption: CaptionCopy;
  try {
    ({ shots, scenePlan, caption } = await writePrompts(chosen, SESSION, {
      skipConfirmation: true,
    }));
  } catch (err) {
    console.error(`✗ Prompt writing failed: ${String(err)}`);
    process.exit(1);
  }

  // ── Step 3: Generate video shots ────────────────────────────────────────────
  const videoClient = getVideoClient();
  const clientName  = videoClient instanceof HiggsFieldMCPClient
    ? "Higgsfield MCP"
    : videoClient instanceof MockOllamaClient
    ? "Ollama"
    : "Higgsfield mock";
  console.log(`\n🎥 Step 3 — ${clientName} generating shots...\n`);
  let generatedShots: GeneratedShot[];
  try {
    generatedShots = await videoClient.generateAllShots(shots);
  } catch (err) {
    console.error(`✗ Video generation failed: ${String(err)}`);
    process.exit(1);
  }

  // ── Step 4: Write scene config ───────────────────────────────────────────────
  console.log("\n📐 Step 4 — Writing Remotion scene config...\n");
  const configPath = writeSceneConfig(scenePlan, generatedShots);

  // ── Step 5: Remotion render ──────────────────────────────────────────────────
  console.log("\n🎬 Step 5 — Remotion rendering...\n");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let videoPath: string;
  try {
    videoPath = await renderRemotionOnly(scenePlan, timestamp);
  } catch (err) {
    console.error(`\n✗ Remotion render failed: ${String(err)}`);
    console.log("\n  Scene config is ready — preview manually:");
    console.log(`  ${configPath}`);
    console.log("  npm run remotion\n");
    process.exit(1);
  }

  // ── Delivery ─────────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PITCHWORX VIDEO — COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Concept   : ${chosen.title}
Format    : ${chosen.format} · ${chosen.duration_seconds}s · 9:16
Virality  : ${chosen.virality_score}/10
Emotion   : ${chosen.target_emotion}
Visual    : ${chosen.visual_style}
Video     : ${videoPath}

━━━━ CAPTION COPY (ready to paste) ━━━━
${caption.hook_line}
${caption.body_lines.join("\n")}
${caption.cta}
${caption.hashtags.join(" ")}

━━━━ SCENE CONFIG ━━━━
${configPath}
Preview → npm run remotion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

run().catch((err) => {
  console.error("\n✗ Run crashed:", String(err));
  process.exit(1);
});
