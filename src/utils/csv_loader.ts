import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import type { TrainingPromptRow, TrainingData } from "../types";

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Splits "Image Generation / Fashion Photography" into type + category. */
function parseMetadata(metadata: string): { type: string; category: string } {
  const slashIdx = metadata.indexOf("/");
  if (slashIdx === -1) {
    return { type: metadata.trim(), category: metadata.trim() };
  }
  return {
    type: metadata.slice(0, slashIdx).trim(),
    category: metadata.slice(slashIdx + 1).trim(),
  };
}

export function loadCsvTrainingData(projectRoot: string): TrainingData {
  const trainingFiles = [
    path.join(projectRoot, "prompts list - Sheet1.csv"),
    path.join(projectRoot, "prompts list - Sheet2.csv"),
  ] as const;

  for (const file of trainingFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `Training CSV missing: ${file}\nBoth CSV files must be present before running the studio.`
      );
    }
  }

  const seen = new Set<string>();

  const trainingRows: TrainingPromptRow[] = trainingFiles.flatMap((file) => {
    const isSheet1 = file.includes("Sheet1");
    const rawContent = fs.readFileSync(file, "utf-8");

    const rows = parse(rawContent, {
      columns: isSheet1,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    }) as (Record<string, string> | string[])[];

    return rows.flatMap((row, index) => {
      let prompt: string;
      let metadata: string;

      if (isSheet1) {
        const r = row as Record<string, string>;
        prompt = r["prompts"] ?? "";
        metadata = r["Metadata / Instruction"] ?? "";
      } else {
        const r = row as string[];
        prompt = r[0] ?? "";
        metadata = r[1] ?? "";
      }

      if (!prompt.trim()) return [];

      // Deduplicate by normalised prompt text
      const key = prompt.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
      if (seen.has(key)) return [];
      seen.add(key);

      const { type, category } = parseMetadata(metadata);

      return [
        {
          id: `${isSheet1 ? "sheet1" : "sheet2"}_${index + 1}`,
          source_file: (isSheet1
            ? "prompts list - Sheet1.csv"
            : "prompts list - Sheet2.csv") as TrainingPromptRow["source_file"],
          prompt,
          metadata,
          parsed_prompt: safeJsonParse(prompt),
          type,
          category,
        },
      ];
    });
  });

  const categories = new Set(trainingRows.map((r) => r.category).filter(Boolean));
  console.log(
    `✓ CSV training loaded: ${trainingRows.length} prompts across ${categories.size} categories`
  );

  return {
    examples: trainingRows,
    image_generation_examples: trainingRows.filter((row) =>
      row.metadata.toLowerCase().includes("image generation")
    ),
    fashion_examples: trainingRows.filter((row) =>
      row.metadata.toLowerCase().includes("fashion")
    ),
    cinematic_examples: trainingRows.filter((row) =>
      row.metadata.toLowerCase().includes("cinematic")
    ),
  };
}

export function selectRelevantExamples(
  training: TrainingData,
  keywords: string[],
  limit = 8
): TrainingPromptRow[] {
  const scored = training.examples.map((row) => {
    const combined = `${row.metadata} ${row.category} ${row.prompt}`.toLowerCase();
    const score = keywords.reduce(
      (acc, kw) => acc + (combined.includes(kw.toLowerCase()) ? 1 : 0),
      0
    );
    return { row, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.row);
}
