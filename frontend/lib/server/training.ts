/**
 * Server-side training data loader for Vercel serverless.
 * Reads bundled JSON files (no fs, no csv-parse — pure import).
 *
 * Used by:
 *   app/api/generate-ideas/route.ts
 *   app/api/write-prompts/route.ts
 *   app/api/produce/route.ts
 */

import trainingJson from "../training/training.json";
import csvPromptsJson from "../training/csv-prompts.json";

// ─── Type aliases (mirrors src/types.ts) ─────────────────────────────────────

interface StyleGuide {
  name: string;
  lighting: string[];
  color_palette: string[];
  mood_descriptors: string[];
  quality_markers: string[];
}

interface HookPattern {
  pattern: string;
  energy: "calm" | "hype" | "cinematic" | "raw" | "luxury" | "any";
  example: string;
}

interface ShotVocabulary {
  lighting: string[];
  camera_movements: string[];
  mood_language: string[];
  style_suffixes: string[];
}

interface NarrativeArcTemplate {
  name: string;
  beat_1: string;
  beat_2: string;
  beat_3: string;
  best_for: string[];
}

interface PlatformRule {
  platform: string;
  optimal_duration_seconds: number;
  caption_style: string;
  hook_style: string;
  caption_length: string;
  hashtag_count: number;
  cta_style: string;
}

interface TrainingPrompts {
  version: string;
  last_updated: string;
  style_guides: StyleGuide[];
  hook_patterns: HookPattern[];
  shot_vocabulary: ShotVocabulary;
  narrative_arcs: NarrativeArcTemplate[];
  platform_rules: PlatformRule[];
  banned_phrases: string[];
}

interface CsvPromptRow {
  id: string;
  source_file: string;
  prompt: string;
  metadata: string;
  type: string;
  category: string;
}

// ─── Cast bundled imports ─────────────────────────────────────────────────────

const training = trainingJson as unknown as TrainingPrompts;
const csvRows  = csvPromptsJson as unknown as CsvPromptRow[];

// ─── Hook Patterns ───────────────────────────────────────────────────────────

export function getHookPatterns(energy?: string): HookPattern[] {
  if (!energy) return training.hook_patterns;
  const normalized = energy.toLowerCase();
  return training.hook_patterns.filter(
    (h) => h.energy === normalized || h.energy === "any"
  );
}

// ─── Narrative Arcs ──────────────────────────────────────────────────────────

export function getNarrativeArcs(): NarrativeArcTemplate[] {
  return training.narrative_arcs;
}

// ─── Platform Rules ──────────────────────────────────────────────────────────

export function getPlatformRules(platform: string): PlatformRule {
  const normalized = platform.toLowerCase().replace(/[^a-z]/g, "");
  const rule = training.platform_rules.find((p) =>
    p.platform.toLowerCase().replace(/[^a-z]/g, "").includes(normalized)
  );
  return rule ?? training.platform_rules[0];
}

// ─── Banned Phrases ──────────────────────────────────────────────────────────

export function getBannedPhrases(): string[] {
  return training.banned_phrases;
}

export function checkBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return training.banned_phrases.filter((phrase) =>
    lower.includes(phrase.toLowerCase())
  );
}

// ─── Shot Vocabulary ─────────────────────────────────────────────────────────

export function getShotVocabulary(): ShotVocabulary {
  return training.shot_vocabulary;
}

// ─── Style Guides ────────────────────────────────────────────────────────────

export function getAllStyleGuides(): StyleGuide[] {
  return training.style_guides;
}

// ─── CSV Prompt Helpers ──────────────────────────────────────────────────────

export function getCsvData(): CsvPromptRow[] {
  return csvRows;
}

/** Return prompts filtered by category substring match (case-insensitive). */
function getCsvPromptsByCategory(category: string): string[] {
  const lower = category.toLowerCase();
  return csvRows
    .filter(
      (r) =>
        r.category.toLowerCase().includes(lower) ||
        r.metadata.toLowerCase().includes(lower)
    )
    .map((r) => r.prompt)
    .filter(Boolean);
}

export function getAllCsvPrompts(): string[] {
  return csvRows.map((r) => r.prompt).filter(Boolean);
}

/** Return n random prompts, optionally filtered by category. */
export function getRandomCsvPrompts(n: number, category?: string): string[] {
  const pool = category
    ? getCsvPromptsByCategory(category)
    : getAllCsvPrompts();

  const source =
    pool.length >= Math.min(n, 3) ? pool : getAllCsvPrompts();

  // Deterministic shuffle via sort so SSR is not non-deterministic in tests.
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/**
 * Select the most topically relevant CSV rows by keyword scoring.
 * Mirrors selectRelevantExamples() in src/utils/csv_loader.ts.
 */
export function selectRelevantExamples(
  keywords: string[],
  limit = 8
): CsvPromptRow[] {
  const scored = csvRows.map((row) => {
    const combined = `${row.metadata} ${row.category} ${row.prompt}`.toLowerCase();
    const score = keywords.reduce(
      (acc, kw) => acc + (combined.includes(kw.toLowerCase()) ? 1 : 0),
      0
    );
    return { row, score };
  });

  const filtered = scored.filter((s) => s.score > 0);
  // Fall back to full set (sorted by score desc) when no keyword matches — never return empty
  return (filtered.length > 0 ? filtered : scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.row);
}
