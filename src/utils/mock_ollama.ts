/**
 * Ollama Testing Mode
 *
 * Real video generation (Higgsfield) costs credits and requires a funded account.
 * In testing mode, we call a local Ollama model instead:
 *
 * - Ollama generates a vivid text description of what each video clip would look like
 * - The description is saved to ./output/ollama_scenes_<timestamp>.md
 * - A placeholder clip URL is used so Remotion can still render the composition
 * - This lets you test the entire pipeline end-to-end for free
 *
 * Setup: brew install ollama && ollama pull llama3.2 && ollama serve
 */

import fs from "fs";
import path from "path";
import type { ShotPrompt, GeneratedShot, VideoScript } from "../types";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const PLACEHOLDER_CLIP = "https://www.w3schools.com/html/mov_bbb.mp4";
const OUTPUT_DIR = path.resolve(process.env.REMOTION_OUTPUT_DIR ?? "./output");

interface OllamaResponse {
  response: string;
  done: boolean;
}

async function callOllama(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.8, num_predict: 200 },
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama API error ${res.status}. Is Ollama running? Start with: ollama serve`
    );
  }

  const data = (await res.json()) as OllamaResponse;
  return data.response.trim();
}

export class MockOllamaClient {
  async generateShot(shot: ShotPrompt): Promise<GeneratedShot> {
    console.log(`🤖 [OLLAMA] ${shot.shot_id} — generating scene description...`);

    let description = "";
    try {
      description = await callOllama(
        `You are a cinematographer. Vividly describe in 3–5 sentences exactly what this video clip would look like. ` +
        `Focus on what the camera sees, the movement, the lighting, and the atmosphere. ` +
        `Be specific and cinematic. ` +
        `\n\nShot prompt: ${shot.prompt}\nNarrative beat: ${shot.narrative_beat}`
      );
    } catch (err) {
      description = `[Ollama unavailable: ${String(err)}]\nShot: ${shot.prompt}`;
    }

    console.log(`  📝 ${description.slice(0, 100)}...`);

    return {
      shot_id: shot.shot_id,
      clip_url: PLACEHOLDER_CLIP,
      thumbnail_url: "",
      duration_seconds: shot.duration_seconds,
      status: "success",
      // Attach description in error field for display (it's not an error)
      error: `[OLLAMA DESCRIPTION]\n${description}`,
    };
  }

  async generateAllShots(shots: ShotPrompt[]): Promise<GeneratedShot[]> {
    console.log(`\n⚠️  Higgsfield not configured — using Ollama (${OLLAMA_MODEL}) for scene descriptions\n`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Run sequentially to avoid Ollama rate-limit on resource-constrained machines
    const results: GeneratedShot[] = [];
    for (const shot of shots) {
      results.push(await this.generateShot(shot));
    }

    // Save the full scene manifest
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const manifestPath = path.join(OUTPUT_DIR, `ollama_scenes_${timestamp}.md`);

    const content = [
      `# Ollama Scene Descriptions — ${timestamp}`,
      `Model: ${OLLAMA_MODEL}`,
      "",
      ...results.map((r, i) => [
        `## Shot ${i + 1}: ${shots[i].shot_id}`,
        `**Beat:** ${shots[i].narrative_beat} | **Duration:** ${shots[i].duration_seconds}s`,
        `**Higgsfield Prompt:**`,
        `> ${shots[i].prompt}`,
        "",
        `**What this clip would look like:**`,
        r.error?.replace("[OLLAMA DESCRIPTION]\n", "") ?? "(no description)",
        "",
      ].join("\n")),
    ].join("\n");

    fs.writeFileSync(manifestPath, content);
    console.log(`\n📄 Scene descriptions saved → ${manifestPath}`);

    return results;
  }

  async applyLipsyncToShots(
    shots: GeneratedShot[],
    _shotPrompts: ShotPrompt[],
    _script: VideoScript,
  ): Promise<GeneratedShot[]> {
    console.log("  [ollama] lipsync skipped — Ollama mode uses placeholder clips");
    return shots;
  }
}
