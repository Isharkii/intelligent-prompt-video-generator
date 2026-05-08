/**
 * test_captions_and_clips.ts
 *
 * Validates that the clip looping bug and caption bug are fixed.
 *
 * Clip fix is verified at CODE level (BRollScene.tsx props) because mock mode
 * intentionally reuses the same placeholder URL for every scene — data uniqueness
 * is not meaningful here. The real fix is key+startFrom+endAt on <Video>.
 *
 * Run: npm run test:video
 */

import fs from "fs";
import path from "path";
import type { RemotionScenePlan, RemotionScene } from "./types";

const CONFIG_PATH = path.resolve("./remotion/scene-config.json");
const BROLL_PATH  = path.resolve("./remotion/compositions/BRollScene.tsx");

// ─── Load ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`✗ scene-config.json not found at ${CONFIG_PATH}`);
  process.exit(1);
}

const config: RemotionScenePlan = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const scenes: RemotionScene[]   = config.scenes;
const brollSrc: string          = fs.existsSync(BROLL_PATH)
  ? fs.readFileSync(BROLL_PATH, "utf-8")
  : "";

console.log(`\nLoaded ${CONFIG_PATH}`);
console.log(`Scenes: ${scenes.length}  FPS: ${config.fps}  Total: ${config.total_duration_frames} frames\n`);

// ─── CLIP TABLE ───────────────────────────────────────────────────────────────

console.log("━".repeat(74));
console.log("CLIP TABLE");
console.log("━".repeat(74));
console.log(`${"scene_id".padEnd(12)} ${"from".padStart(6)} ${"dur".padStart(6)}  clip_url`);
console.log("─".repeat(74));

for (const s of scenes) {
  const clipPreview = s.clip_url
    ? (s.clip_url.length > 50 ? "..." + s.clip_url.slice(-47) : s.clip_url)
    : "(placeholder)";
  console.log(
    `${s.scene_id.padEnd(12)} ${String(s.from_frame).padStart(6)} ${String(s.duration_frames).padStart(6)}  ${clipPreview}`
  );
}

// ─── CLIP CHECKS ──────────────────────────────────────────────────────────────
// The clip looping fix lives in BRollScene.tsx (key + startFrom + endAt).
// We check the source code directly — data URL uniqueness is false in mock mode.

let clipPass = true;
const clipIssues: string[] = [];

if (!brollSrc.includes("key={scene.scene_id}")) {
  clipIssues.push("BRollScene.tsx: missing key={scene.scene_id} — React reuses DOM node");
  clipPass = false;
}
if (!brollSrc.includes("startFrom={0}")) {
  clipIssues.push("BRollScene.tsx: missing startFrom={0} — clip won't reset to frame 0");
  clipPass = false;
}
if (!brollSrc.includes("endAt={scene.duration_frames}")) {
  clipIssues.push("BRollScene.tsx: missing endAt={scene.duration_frames} — clip can overflow");
  clipPass = false;
}

// from_frame must be contiguous
let expectedFrom = 0;
for (const s of scenes) {
  if (s.from_frame !== expectedFrom) {
    clipIssues.push(
      `${s.scene_id}: from_frame=${s.from_frame} expected ${expectedFrom} (gap or overlap)`
    );
    clipPass = false;
  }
  expectedFrom += s.duration_frames;
}

// No fractional frames
for (const s of scenes) {
  if (!Number.isInteger(s.from_frame) || !Number.isInteger(s.duration_frames)) {
    clipIssues.push(`${s.scene_id}: non-integer from_frame or duration_frames`);
    clipPass = false;
  }
}

// ─── CAPTION TABLE ────────────────────────────────────────────────────────────

console.log("\n");
console.log("━".repeat(74));
console.log("CAPTION TABLE");
console.log("━".repeat(74));
console.log(
  `${"scene_id".padEnd(12)} ${"style".padEnd(14)} ${"appear".padStart(6)} ${"disap".padStart(6)} ${"dur".padStart(5)}  text`
);
console.log("─".repeat(74));

for (const s of scenes) {
  const c = s.caption;
  console.log(
    `${s.scene_id.padEnd(12)} ${c.style.padEnd(14)} ${String(c.appear_at_frame).padStart(6)} ${String(c.disappear_at_frame).padStart(6)} ${String(s.duration_frames).padStart(5)}  "${c.text.slice(0, 30)}${c.text.length > 30 ? "..." : ""}"`
  );
}

// ─── CAPTION CHECKS ───────────────────────────────────────────────────────────

let captionPass = true;
const captionIssues: string[] = [];

for (const s of scenes) {
  const c    = s.caption;
  const name = s.scene_id;

  if (c.style === "none") {
    captionIssues.push(`${name}: style="none" — captions disabled`);
    captionPass = false;
  }
  if (!c.text || c.text.trim() === "") {
    captionIssues.push(`${name}: empty caption text`);
    captionPass = false;
  }
  if (c.appear_at_frame >= c.disappear_at_frame) {
    captionIssues.push(
      `${name}: appear_at_frame(${c.appear_at_frame}) >= disappear_at_frame(${c.disappear_at_frame})`
    );
    captionPass = false;
  }
  if (c.disappear_at_frame > s.duration_frames) {
    captionIssues.push(
      `${name}: disappear_at_frame(${c.disappear_at_frame}) > duration_frames(${s.duration_frames})`
    );
    captionPass = false;
  }
  if (c.disappear_at_frame - c.appear_at_frame < 20) {
    captionIssues.push(
      `${name}: caption visible for only ${c.disappear_at_frame - c.appear_at_frame} frames (min 20)`
    );
    captionPass = false;
  }
}

if (scenes.length > 0 && scenes[0].caption.style === "none") {
  captionIssues.push("First scene has style=none — hook caption missing");
  captionPass = false;
}

// ─── VERDICT ──────────────────────────────────────────────────────────────────

console.log("\n");
console.log("━".repeat(74));
console.log("VERDICT");
console.log("━".repeat(74));

if (clipPass) {
  console.log("  CLIP BUG:    FIXED ✓");
} else {
  console.log("  CLIP BUG:    NOT FIXED ✗");
  clipIssues.forEach((i) => console.log(`    ↳ ${i}`));
}

if (captionPass) {
  console.log("  CAPTION BUG: FIXED ✓");
} else {
  console.log("  CAPTION BUG: NOT FIXED ✗");
  captionIssues.forEach((i) => console.log(`    ↳ ${i}`));
}

console.log("");

if (!clipPass || !captionPass) process.exit(1);
