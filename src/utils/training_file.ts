import fs from "fs";
import path from "path";
import type { TrainingPrompts } from "../types";

const TRAINING_FILE = path.resolve(process.cwd(), "training_prompts.json");
const TMP_FILE      = TRAINING_FILE + ".tmp";

const REQUIRED_KEYS: Array<keyof TrainingPrompts> = [
  "version", "last_updated", "style_guides",
  "hook_patterns", "shot_vocabulary", "narrative_arcs",
  "platform_rules", "banned_phrases",
];

export function readTrainingFile(): TrainingPrompts {
  return JSON.parse(fs.readFileSync(TRAINING_FILE, "utf-8")) as TrainingPrompts;
}

export function saveTrainingFile(data: TrainingPrompts): void {
  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) throw new Error(`Missing required key: ${key}`);
  }
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(TMP_FILE, json, "utf-8");
  fs.renameSync(TMP_FILE, TRAINING_FILE);
  console.log(`✓ training_prompts.json saved (${new Date().toISOString()})`);
}

export function validateTrainingJson(raw: unknown): raw is TrainingPrompts {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  for (const key of REQUIRED_KEYS) {
    if (!(key in (raw as object))) return false;
  }
  return true;
}
