/**
 * Full end-to-end test: Claude as MCP orchestrator
 * Brief: Pitchworx — custom pitch decks, Instagram, Sales, Hype
 *
 * Run: node test_generation.mjs
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";

// Load env vars
const env = Object.fromEntries(
  readFileSync(".env", "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const ANTHROPIC_KEY  = env.ANTHROPIC_API_KEY;
const HIGGSFIELD_URL = env.HIGGSFIELD_MCP_URL  ?? "https://mcp.higgsfield.ai/mcp";
const HIGGSFIELD_KEY = env.HIGGSFIELD_API_KEY;

if (!ANTHROPIC_KEY || !HIGGSFIELD_KEY) {
  console.error("Missing ANTHROPIC_API_KEY or HIGGSFIELD_API_KEY in .env");
  process.exit(1);
}

const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

const SYSTEM = `You are an autonomous AI video production director for short-form social media.

You have Higgsfield AI video generation tools. Produce a complete short-form video for the given brief.

SHOT PROMPT FORMULA — all elements required:
SUBJECT + ACTION + ENVIRONMENT + LIGHTING + CAMERA MOVEMENT + MOOD + STYLE SUFFIX

WORKFLOW — do these steps in order:
1. Call models_explore with action "recommend" and provide the visual style + mood to select the best model. Note the model_id returned.
2. Write 2 shot prompts (setup + payoff) using the formula above
3. Generate each shot with generate_video using the chosen model_id (aspect_ratio "9:16", duration 4)
4. Poll job_status for each job_id until status contains "completed", "done", or "succeeded"
5. Retrieve each clip URL with job_display
6. Write caption copy and voiceover script

SHOT RULES:
- aspect_ratio: "9:16"
- negative_prompt: "blurry, overexposed, amateur, shaky, text on screen, watermark"
- Keep prompts vivid and cinematic — specific subject, action, environment, lighting, camera, mood, style

VOICEOVER RULES:
- Under 50 words total
- hook_line: first 3 seconds, grabs attention immediately
- body_script: 2–3 short punchy sentences, no filler
- outro_line: spoken CTA

CAPTION RULES:
- hook_line: pattern interrupt, specific and visual
- body_lines: 3 lines — expand, tension, payoff
- cta: low-friction Instagram CTA
- hashtags: 5 relevant tags

END WITH this exact JSON block:
\`\`\`json
{
  "model_used": "model_id_here",
  "shots": [
    { "shot_id": "shot_01", "clip_url": "URL", "status": "success", "duration_seconds": 4 },
    { "shot_id": "shot_02", "clip_url": "URL", "status": "success", "duration_seconds": 4 }
  ],
  "voiceover": {
    "hook_line": "First 3 seconds spoken text",
    "body_script": "Main narration — 2-3 short sentences",
    "outro_line": "Closing CTA spoken aloud"
  },
  "caption": {
    "hook_line": "Pattern-interrupt first line",
    "body_lines": ["expand", "tension", "payoff"],
    "cta": "Call to action",
    "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
  }
}
\`\`\``;

const USER = `BRIEF:
Brand: Pitchworx
Product: Custom pitch decks that close deals
Platform: Instagram Reels
Mood: Hype, high-energy, aspirational
Goal: Sales — drive DMs and link clicks
Visual style: Sleek corporate cinematics, dark moody boardrooms, sharp suits, screens with data
Target emotion: FOMO + Ambition

Produce 2 shots. Write voiceover + caption. Select the best model using models_explore first.`;

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  PITCHWORX × HIGGSFIELD MCP — FULL TEST");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

let fullText  = "";
let toolCount = 0;

const stream = await client.beta.messages.create({
  model:      "claude-opus-4-7",
  max_tokens: 16000,
  system:     SYSTEM,
  messages:   [{ role: "user", content: USER }],
  betas:      ["mcp-client-2025-04-04"],
  mcp_servers: [{
    type:                "url",
    name:                "higgsfield",
    url:                 HIGGSFIELD_URL,
    authorization_token: HIGGSFIELD_KEY,
  }],
  stream: true,
});

for await (const event of stream) {
  if (event.type === "content_block_start") {
    const block = event.content_block;
    if (block?.type === "tool_use") {
      toolCount++;
      console.log(`\n→ [tool ${toolCount}] ${block.name}`);
    }
  } else if (event.type === "content_block_delta") {
    if (event.delta?.type === "text_delta") {
      process.stdout.write(event.delta.text);
      fullText += event.delta.text;
    }
  } else if (event.type === "message_stop") {
    console.log("\n");
  }
}

// Parse final JSON
const match = fullText.match(/```json\s*([\s\S]*?)\s*```/);
if (match) {
  try {
    const result = JSON.parse(match[1]);
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  PRODUCTION RESULT");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Model used  : ${result.model_used ?? "unknown"}`);
    console.log(`Shots       : ${(result.shots ?? []).length} generated`);
    for (const s of result.shots ?? []) {
      console.log(`  ${s.shot_id} [${s.status}] → ${s.clip_url || "no url"}`);
    }
    console.log(`\nVoiceover hook : "${result.voiceover?.hook_line}"`);
    console.log(`Body script    : "${result.voiceover?.body_script}"`);
    console.log(`Outro          : "${result.voiceover?.outro_line}"`);
    console.log(`\nCaption hook   : "${result.caption?.hook_line}"`);
    console.log(`Hashtags       : ${result.caption?.hashtags?.join(" ")}`);
    console.log("\n✓ Test complete");
  } catch (e) {
    console.error("\n✗ Could not parse result JSON:", e.message);
  }
} else {
  console.log("\n⚠ No JSON block found in output");
}
