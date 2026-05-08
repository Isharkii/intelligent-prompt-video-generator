import "dotenv/config";
import fs from "fs";
import express from "express";
import path from "path";
import type { Request, Response } from "express";
import type { SessionContext, ShotPrompt, GeneratedShot, RemotionScenePlan, CaptionCopy } from "./types";
import { generateIdeas } from "./agents/idea_generator";
import { writePrompts } from "./agents/prompt_writer";
import { writeSceneConfig, renderCombined, renderRemotionOnly, renderVariants } from "./integrations/remotion_runner";
import { renderHiggsFieldOnly } from "./integrations/ffmpeg_concat";
import { selectTrack } from "./utils/music_selector";
import { HiggsFieldMCPClient, MockHiggsFieldClient } from "./integrations/higgsfield";
import { MockOllamaClient } from "./utils/mock_ollama";
import { training } from "./utils/training_loader";
import { readTrainingFile, saveTrainingFile, validateTrainingJson } from "./utils/training_file";
import { loadCsvTrainingData } from "./utils/csv_loader";

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use(express.static(path.resolve("./frontend")));
app.use("/output", express.static(path.resolve("./output")));

// Prevent concurrent production runs — shared config files (scene-config-combined.json)
// would be overwritten mid-render if two requests ran simultaneously.
let producing = false;

// In-memory record of the last completed session — used by /api/retry
interface LastSession {
  shots: ShotPrompt[];
  generatedShots: GeneratedShot[];
  scenePlan: RemotionScenePlan;
  caption: CaptionCopy;
  context: SessionContext;
}
let lastSession: LastSession | null = null;

// ─── Video client (same logic as director.ts) ─────────────────────────────────

function getVideoClient() {
  if (process.env.USE_OLLAMA === "true") return new MockOllamaClient();
  const hasMcpUrl = Boolean(
    process.env.HIGGSFIELD_MCP_URL &&
    process.env.HIGGSFIELD_MCP_URL !== "https://your-higgsfield-mcp-endpoint"
  );
  return hasMcpUrl ? new HiggsFieldMCPClient() : new MockHiggsFieldClient();
}

// ─── POST /api/generate-ideas ─────────────────────────────────────────────────

app.post("/api/generate-ideas", async (req: Request, res: Response) => {
  const { topic, brand, platform, goal, mood, reference } = req.body as Record<string, string>;

  if (!topic?.trim()) {
    res.status(400).json({ error: "topic is required" });
    return;
  }

  const context: SessionContext = {
    topic:     topic.trim(),
    brand:     brand?.trim()     || undefined,
    platform:  platform?.trim()  || undefined,
    goal:      goal?.trim()      || undefined,
    mood:      mood?.trim()      || undefined,
    reference: reference?.trim() || undefined,
  };

  try {
    const ideas = await generateIdeas(context);
    res.json({ ideas, context });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/write-prompts ──────────────────────────────────────────────────

app.post("/api/write-prompts", async (req: Request, res: Response) => {
  const { conceptIndex, ideas, context } = req.body as {
    conceptIndex: number;
    ideas: Awaited<ReturnType<typeof generateIdeas>>;
    context: SessionContext;
  };

  const concept = ideas?.[conceptIndex];
  if (!concept) {
    res.status(400).json({ error: "Invalid conceptIndex" });
    return;
  }

  try {
    const result = await writePrompts(concept, context, { skipConfirmation: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/resize ─────────────────────────────────────────────────────────

app.post("/api/resize", async (req: Request, res: Response) => {
  const { formats } = req.body as { formats?: ("9:16" | "1:1" | "16:9")[] };
  const COMBINED_CONFIG = path.resolve("./remotion/scene-config-combined.json");

  if (!fs.existsSync(COMBINED_CONFIG)) {
    res.status(404).json({ error: "No scene config found. Produce a video first." });
    return;
  }

  try {
    const outputPaths = await renderVariants(COMBINED_CONFIG, formats ?? ["1:1", "16:9"]);
    res.json({ outputPaths: outputPaths.map((p) => `/output/${path.basename(p)}`) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/retry  (SSE stream) ───────────────────────────────────────────

app.post("/api/retry", async (_req: Request, res: Response) => {
  if (producing) {
    res.status(409).json({ error: "A production job is already running." });
    return;
  }
  if (!lastSession) {
    res.status(400).json({ error: "No session to retry. Run a production first." });
    return;
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  producing = true;

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const session = lastSession;
    const failedShots = session.generatedShots
      .filter((s) => s.status !== "success")
      .map((s) => session.shots.find((sp) => sp.shot_id === s.shot_id))
      .filter((sp): sp is ShotPrompt => sp !== undefined);

    if (failedShots.length > 0) {
      send("progress", { stage: "higgsfield", status: "running", message: `Retrying ${failedShots.length} failed shot(s)...` });
      const videoClient  = getVideoClient();
      const retryResults = await videoClient.generateAllShots(failedShots);

      // Merge retried results back into the session
      for (const result of retryResults) {
        const idx = session.generatedShots.findIndex((s) => s.shot_id === result.shot_id);
        if (idx !== -1) session.generatedShots[idx] = result;
      }

      const successCount = session.generatedShots.filter((s) => s.status === "success").length;
      send("progress", { stage: "higgsfield", status: "done", message: `${successCount}/${session.generatedShots.length} shots now successful` });
    } else {
      send("progress", { stage: "higgsfield", status: "skipped", message: "No failed shots — re-rendering with existing clips" });
    }

    send("progress", { stage: "remotion", status: "running", message: "Re-rendering final video..." });

    const configPath  = writeSceneConfig(session.scenePlan, session.generatedShots);
    const musicPath   = selectTrack(session.scenePlan.music_mood);
    const timestamp   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    let videoPath = "";
    try {
      const r = await renderHiggsFieldOnly(session.generatedShots, timestamp, undefined, musicPath ?? undefined);
      videoPath = r.outputPath;
    } catch { /* continue */ }
    try {
      const combined = await renderCombined(configPath, timestamp);
      videoPath = combined;
    } catch { /* continue */ }

    if (!videoPath) throw new Error("Re-render failed.");

    send("progress", { stage: "remotion", status: "done", message: "Re-render complete" });
    send("done", {
      videoPath: `/output/${path.basename(videoPath)}`,
      caption:   session.caption,
      shots:     session.generatedShots,
      concept:   session.shots[0] ? { title: "Retry" } : {},
    });

  } catch (err) {
    send("error", { message: String(err) });
  } finally {
    producing = false;
    res.end();
  }
});

// ─── POST /api/produce  (SSE stream) ─────────────────────────────────────────

app.post("/api/produce", async (req: Request, res: Response) => {
  const { conceptIndex, ideas, context } = req.body as {
    conceptIndex: number;
    ideas: Awaited<ReturnType<typeof generateIdeas>>;
    context: SessionContext;
  };

  const concept = ideas?.[conceptIndex];
  if (!concept) {
    res.status(400).json({ error: "Invalid conceptIndex" });
    return;
  }

  if (producing) {
    res.status(409).json({ error: "A production job is already running. Wait for it to finish." });
    return;
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // prevent nginx from buffering SSE events
  res.flushHeaders();

  producing = true;

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Step 1 — write all prompts (skip interactive GO confirmation)
    send("progress", { stage: "prompts", status: "running", message: "Writing shot prompts and scene plan..." });
    const { shots, scenePlan, caption } = await writePrompts(concept, context, { skipConfirmation: true });
    send("progress", { stage: "prompts", status: "done", message: `${shots.length} shot prompts ready` });

    // Step 2 — generate Higgsfield video clips
    send("progress", { stage: "higgsfield", status: "running", message: `Generating ${shots.length} video shots...` });
    const videoClient    = getVideoClient();
    let generatedShots   = await videoClient.generateAllShots(shots);
    const successCount   = generatedShots.filter((s) => s.status === "success").length;
    send("progress", { stage: "higgsfield", status: "done", message: `${successCount}/${generatedShots.length} shots generated` });

    // Step 3 — ElevenLabs lipsync via Higgsfield
    if (process.env.ENABLE_VOICEOVER === "true" && concept.script) {
      send("progress", { stage: "lipsync", status: "running", message: "Applying ElevenLabs lipsync via Higgsfield..." });
      try {
        generatedShots = await videoClient.applyLipsyncToShots(generatedShots, shots, concept.script);
        send("progress", { stage: "lipsync", status: "done", message: "Lipsync applied" });
      } catch (err) {
        send("progress", { stage: "lipsync", status: "warning", message: `Lipsync skipped: ${String(err)}` });
      }
    } else {
      send("progress", { stage: "lipsync", status: "skipped", message: "Voiceover disabled (set ENABLE_VOICEOVER=true)" });
    }

    // Step 4 — write scene config and render
    const configPath = writeSceneConfig(scenePlan, generatedShots);
    const musicPath  = selectTrack(scenePlan.music_mood);
    const timestamp  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    send("progress", { stage: "remotion", status: "running", message: "Rendering final video..." });

    let higgsOnlyPath  = "";
    let remotionPath   = "";
    let combinedPath   = "";

    try {
      const r = await renderHiggsFieldOnly(generatedShots, timestamp, undefined, musicPath ?? undefined);
      higgsOnlyPath = r.outputPath;
    } catch (err) {
      send("progress", { stage: "remotion", status: "warning", message: `Clips-only render failed: ${String(err)}` });
    }

    try {
      remotionPath = await renderRemotionOnly(scenePlan, timestamp);
    } catch (err) {
      send("progress", { stage: "remotion", status: "warning", message: `Remotion-only render failed: ${String(err)}` });
    }

    try {
      combinedPath = await renderCombined(configPath, timestamp);
    } catch (err) {
      send("progress", { stage: "remotion", status: "warning", message: `Combined render failed: ${String(err)}` });
    }

    const videoPath = combinedPath || remotionPath || higgsOnlyPath;
    if (!videoPath) throw new Error("All three renders failed.");

    send("progress", { stage: "remotion", status: "done", message: "Render complete" });

    // Persist session so /api/retry can re-use it
    lastSession = { shots, generatedShots, scenePlan, caption, context };

    send("done", {
      videoPath:    `/output/${path.basename(videoPath)}`,
      caption,
      shots:        generatedShots,
      concept,
    });

  } catch (err) {
    send("error", { message: String(err) });
  } finally {
    producing = false;
    res.end();
  }
});

// ─── Training API ─────────────────────────────────────────────────────────────

app.get("/api/training/hooks", (_req: Request, res: Response) => {
  const hooks = training.getHookPatterns().map((h, i) => ({ ...h, id: `hp_${i + 1}` }));
  res.json({ hooks });
});

app.delete("/api/training/hooks/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idx = parseInt(id.replace("hp_", ""), 10) - 1;
    const data = readTrainingFile();
    if (idx < 0 || idx >= data.hook_patterns.length) {
      res.status(404).json({ error: "Hook not found" });
      return;
    }
    data.hook_patterns.splice(idx, 1);
    saveTrainingFile(data);
    training.reload();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/training/vocabulary", (_req: Request, res: Response) => {
  const vocab = training.getShotVocabulary();
  res.json({ vocabulary: vocab });
});

app.patch("/api/training/vocabulary", (req: Request, res: Response) => {
  try {
    const { category, items } = req.body as { category: string; items: string[] };
    const data = readTrainingFile();
    (data.shot_vocabulary as unknown as Record<string, string[]>)[category] = items;
    saveTrainingFile(data);
    training.reload();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/training/arcs", (_req: Request, res: Response) => {
  const arcs = training.getNarrativeArcs().map((a, i) => ({ ...a, id: `arc_${i + 1}` }));
  res.json({ arcs });
});

app.delete("/api/training/arcs/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idx = parseInt(id.replace("arc_", ""), 10) - 1;
    const data = readTrainingFile();
    if (idx < 0 || idx >= data.narrative_arcs.length) {
      res.status(404).json({ error: "Arc not found" });
      return;
    }
    data.narrative_arcs.splice(idx, 1);
    saveTrainingFile(data);
    training.reload();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/training/banned", (_req: Request, res: Response) => {
  res.json({ phrases: training.getBannedPhrases() });
});

app.post("/api/training/banned", (req: Request, res: Response) => {
  try {
    const { phrase } = req.body as { phrase: string };
    const data = readTrainingFile();
    data.banned_phrases.push(phrase.trim());
    saveTrainingFile(data);
    training.reload();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Delete by phrase string — avoids index drift when multiple deletes happen
app.delete("/api/training/banned", (req: Request, res: Response) => {
  try {
    const { phrase } = req.body as { phrase: string };
    const data = readTrainingFile();
    data.banned_phrases = data.banned_phrases.filter((p) => p !== phrase);
    saveTrainingFile(data);
    training.reload();
    res.json({ success: true, removed: phrase });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/training/csv", (_req: Request, res: Response) => {
  try {
    const csvData = loadCsvTrainingData(process.cwd());
    res.json({ rows: csvData.examples });
  } catch (err) {
    res.json({ rows: [] });
  }
});

app.post("/api/training/upload-csv", (req: Request, res: Response) => {
  // Body is raw CSV text; client passes Content-Type: text/plain
  res.json({ status: "ok", message: "CSV upload endpoint placeholder — wire to csv_loader if needed." });
});

app.get("/api/training/raw", (_req: Request, res: Response) => {
  try {
    const data = readTrainingFile();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.put("/api/training/raw", (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!validateTrainingJson(body)) {
      res.status(400).json({ error: "Invalid JSON: missing required top-level keys" });
      return;
    }
    saveTrainingFile(body);
    training.reload();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: `Invalid JSON: ${String(err)}` });
  }
});

app.get("/api/training/stats", (_req: Request, res: Response) => {
  res.json({
    hookCount:       training.getHookPatterns().length,
    arcCount:        training.getNarrativeArcs().length,
    styleGuideCount: training.getAllStyleGuides().length,
    csvPromptCount:  training.getAllCsvPrompts().length,
  });
});

// Manual reload — forces in-memory singleton to re-read disk
app.post("/api/training/reload", (_req: Request, res: Response) => {
  training.reload();
  res.json({
    success: true,
    stats: {
      hookCount:       training.getHookPatterns().length,
      arcCount:        training.getNarrativeArcs().length,
      csvPromptCount:  training.getAllCsvPrompts().length,
    },
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎬 Social Media Studio — Web UI`);
  console.log(`   http://localhost:${PORT}\n`);
});
