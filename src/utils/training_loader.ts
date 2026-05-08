import fs from "fs";
import path from "path";
import type {
  TrainingPrompts,
  TrainingData,
  StyleGuide,
  HookPattern,
  ShotVocabulary,
  NarrativeArcTemplate,
  PlatformRule,
} from "../types";
import { loadCsvTrainingData } from "./csv_loader";

const TRAINING_FILE = path.resolve(process.cwd(), "training_prompts.json");

const REQUIRED_FIELDS: Array<keyof TrainingPrompts> = [
  "version",
  "last_updated",
  "style_guides",
  "hook_patterns",
  "shot_vocabulary",
  "narrative_arcs",
  "platform_rules",
  "banned_phrases",
];

function parseAndValidate(): TrainingPrompts {
  if (!fs.existsSync(TRAINING_FILE)) {
    throw new Error(
      "training_prompts.json not found. Create this file before running the studio."
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(TRAINING_FILE, "utf-8"));
  } catch {
    throw new Error(
      "training_prompts.json is not valid JSON — fix the syntax and retry."
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      'training_prompts.json validation failed: root value must be an object, got "' +
        (Array.isArray(raw) ? "array" : typeof raw) +
        '"'
    );
  }

  const data = raw as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      throw new Error(
        `training_prompts.json validation failed: missing required field "${field}"`
      );
    }
  }

  const t = raw as unknown as TrainingPrompts;

  console.log(
    `✓ Training loaded: ${t.hook_patterns.length} hook patterns, ` +
      `${t.narrative_arcs.length} arcs, ${t.style_guides.length} style guides`
  );

  return t;
}

const EMPTY_CSV: TrainingData = {
  examples: [],
  image_generation_examples: [],
  fashion_examples: [],
  cinematic_examples: [],
};

class TrainingLoader {
  private data: TrainingPrompts;
  private csvData: TrainingData;

  constructor() {
    this.data    = parseAndValidate();
    this.csvData = this.loadCsv();
  }

  private loadCsv(): TrainingData {
    try {
      return loadCsvTrainingData(process.cwd());
    } catch (err) {
      console.warn(`⚠  CSV training not loaded: ${String(err)}`);
      return EMPTY_CSV;
    }
  }

  /**
   * Re-reads training_prompts.json and both CSV files from disk.
   * Called after every API mutation so the in-memory singleton stays in sync.
   * Never throws — keeps the previous data on failure.
   */
  reload(): void {
    try {
      this.data    = parseAndValidate();
      this.csvData = this.loadCsv();
      console.log(`✓ Training reloaded (${new Date().toISOString()})`);
    } catch (err) {
      console.error(`✗ Training reload failed — keeping previous data: ${String(err)}`);
    }
  }

  // ─── JSON Training Methods ──────────────────────────────────────────────────

  getHookPatterns(energy?: string): HookPattern[] {
    if (!energy) return this.data.hook_patterns;
    const normalized = energy.toLowerCase();
    return this.data.hook_patterns.filter(
      (h) => h.energy === normalized || h.energy === "any"
    );
  }

  getStyleGuide(name: string): StyleGuide {
    const guide = this.data.style_guides.find(
      (s) => s.name === name || s.name.replace(/_/g, " ") === name.replace(/_/g, " ")
    );
    if (!guide) {
      throw new Error(
        `Style guide "${name}" not found in training_prompts.json. ` +
          `Available: ${this.data.style_guides.map((s) => s.name).join(", ")}`
      );
    }
    return guide;
  }

  getAllStyleGuides(): StyleGuide[] {
    return this.data.style_guides;
  }

  getShotVocabulary(): ShotVocabulary {
    return this.data.shot_vocabulary;
  }

  getNarrativeArcs(): NarrativeArcTemplate[] {
    return this.data.narrative_arcs;
  }

  getPlatformRules(platform: string): PlatformRule {
    const normalized = platform.toLowerCase().replace(/[^a-z]/g, "");
    const rule = this.data.platform_rules.find((p) =>
      p.platform.toLowerCase().replace(/[^a-z]/g, "").includes(normalized)
    );
    return rule ?? this.data.platform_rules[0];
  }

  getBannedPhrases(): string[] {
    return this.data.banned_phrases;
  }

  checkBannedPhrases(text: string): string[] {
    const lower = text.toLowerCase();
    return this.data.banned_phrases.filter((phrase) =>
      lower.includes(phrase.toLowerCase())
    );
  }

  getRandomShotLanguage(
    category: "lighting" | "camera_movements" | "mood_language" | "style_suffixes"
  ): string {
    const vocab = this.data.shot_vocabulary[category];
    return vocab[Math.floor(Math.random() * vocab.length)];
  }

  // ─── CSV Training Methods ───────────────────────────────────────────────────

  getCsvPromptsByCategory(category: string): string[] {
    const lower = category.toLowerCase();
    return this.csvData.examples
      .filter(
        (r) =>
          r.category.toLowerCase().includes(lower) ||
          r.metadata.toLowerCase().includes(lower)
      )
      .map((r) => r.prompt)
      .filter(Boolean);
  }

  getAllCsvPrompts(): string[] {
    return this.csvData.examples.map((r) => r.prompt).filter(Boolean);
  }

  getRandomCsvPrompts(n: number, category?: string): string[] {
    const pool = category
      ? this.getCsvPromptsByCategory(category)
      : this.getAllCsvPrompts();

    const source =
      pool.length >= Math.min(n, 3) ? pool : this.getAllCsvPrompts();

    const shuffled = [...source].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  getCsvData(): TrainingData {
    return this.csvData;
  }
}

export const training = new TrainingLoader();
