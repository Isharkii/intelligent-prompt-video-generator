/**
 * POST /api/generate-ideas
 *
 * Self-contained Anthropic call — no Express backend required.
 * Replicates the prompts from src/agents/idea_generator.ts exactly.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SessionContext, IdeaConcept, VideoScript } from "@/lib/types";
import {
  getHookPatterns,
  getNarrativeArcs,
  getPlatformRules,
  getBannedPhrases,
  checkBannedPhrases,
  getRandomCsvPrompts,
  selectRelevantExamples,
} from "@/lib/server/training";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// ─── Mood → CSV category mapping ─────────────────────────────────────────────

function mapMoodToCategory(mood?: string): string | undefined {
  const map: Record<string, string> = {
    calm:      "lifestyle",
    hype:      "urban",
    cinematic: "cinematic",
    luxury:    "fashion",
    raw:       "candid",
  };
  return mood ? map[mood.toLowerCase()] : undefined;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildConceptSystemPrompt(
  session: SessionContext,
  csvSystemExamples: string
): string {
  const hookPatterns  = getHookPatterns(session.mood);
  const narrativeArcs = getNarrativeArcs();
  const platformRules = getPlatformRules(session.platform ?? "Instagram");
  const bannedPhrases = getBannedPhrases();

  return `You are an autonomous AI creative director generating short-form video concepts.

PLATFORM RULES for ${platformRules.platform}:
- Optimal duration: ${platformRules.optimal_duration_seconds}s
- Hook style: ${platformRules.hook_style}
- Caption style: ${platformRules.caption_style}
- CTA style: ${platformRules.cta_style}

HOOK PATTERNS — use these as structural templates for the hook field:
${hookPatterns.map((h) => `• [${h.energy}] ${h.pattern}\n  Example: ${h.example}`).join("\n")}

NARRATIVE ARCS — map each concept to one of these structures:
${narrativeArcs.map((a) => `• ${a.name}: Beat1: ${a.beat_1} | Beat2: ${a.beat_2} | Beat3: ${a.beat_3}\n  Best for: ${a.best_for.join(", ")}`).join("\n")}

BANNED PHRASES — never use any of these in hooks, titles, or reasoning:
${bannedPhrases.join(", ")}

REAL PROMPT EXAMPLES — match this quality and style:
${csvSystemExamples}

DIVERSITY RULES — enforce all three (one rule per concept):
1. Concept 1 must be counterintuitive: its virality_reasoning must contain "counterintuitive" or "challenges"
2. Concept 2 must use a trending platform format (duet, POV, day-in-the-life, reaction, etc.)
3. Concept 3 must be purely visual-led — minimal or no text, maximum imagery
4. No two concepts may share the same visual_style or the same target_emotion

OUTPUT FORMAT:
- Return ONLY a valid JSON array of exactly 3 IdeaConcept objects
- No markdown fences, no preamble, no trailing text
- Every field in the schema is required`;
}

// ─── User Prompt ──────────────────────────────────────────────────────────────

function buildConceptUserPrompt(session: SessionContext, csvExamples: string): string {
  return `SESSION CONTEXT:
- Topic: ${session.topic}
${session.brand    ? `- Brand: ${session.brand}`       : ""}
${session.platform ? `- Platform: ${session.platform}` : "- Platform: Instagram"}
${session.goal     ? `- Goal: ${session.goal}`          : ""}
${session.mood     ? `- Mood: ${session.mood}`          : ""}
${session.reference? `- Reference: ${session.reference}`: ""}

TRAINING EXAMPLES (use as visual taste reference — do not copy verbatim):
${csvExamples}

Return a JSON array of exactly 3 concepts. Each object must follow this schema:
{
  "id": "concept_01",
  "title": "five word punchy title",
  "hook": "Specific first-3-second scroll-stopper description",
  "format": "Reel",
  "duration_seconds": 30,
  "narrative_arc": {
    "beat_1_setup": "Seconds 0-10 — what we show/say",
    "beat_2_tension": "Seconds 10-20 — conflict or contrast",
    "beat_3_payoff": "Seconds 20-30 — resolution or CTA"
  },
  "visual_style": "specific style e.g. golden hour cinematic shallow depth",
  "target_emotion": "FOMO",
  "shot_count": 4,
  "training_patterns_used": ["sheet1_1"],
  "virality_score": 8,
  "virality_reasoning": "Specific concrete reason — not generic"
}

Apply all diversity rules. Return ONLY the JSON array.`;
}

// ─── Script Prompts ───────────────────────────────────────────────────────────

function buildScriptSystemPrompt(session: SessionContext): string {
  const platformRules = getPlatformRules(session.platform ?? "Instagram");
  const bannedPhrases = getBannedPhrases();

  return `You are a short-form video scriptwriter. Write beat-by-beat scripts for social media videos.

SPEAKING PACE: 130 words per minute.
- 10-second beat = 22 words maximum
- 30-second video = 65 words maximum for the full voiceover
- Always stay under the word limit. Tight copy hits harder.

PLATFORM: ${platformRules.platform}
- Hook style: ${platformRules.hook_style}
- Caption style: ${platformRules.caption_style}

ON-SCREEN TEXT RULES:
- Maximum 6 words per text overlay
- Must reinforce or contrast the voiceover — never repeat it verbatim
- Bold, specific, visual language only

BANNED PHRASES — never use:
${bannedPhrases.join(", ")}

VOICEOVER RULES:
- Write exactly what would be spoken — no stage directions, no brackets
- First sentence must hook in under 3 seconds
- Use the second person ("you", "your") for engagement
- End with a beat of silence (payoff = let the visual land, not the words)${session.brand ? `\n- Brand voice: ${session.brand}` : ""}

OUTPUT: Return ONLY a valid JSON object as VideoScript. No markdown, no explanation.`;
}

function buildScriptUserPrompt(concept: IdeaConcept): string {
  const maxWords = Math.round((concept.duration_seconds / 60) * 130);

  return `Write the full video script for this concept.

CONCEPT:
- Title: ${concept.title}
- Hook: ${concept.hook}
- Visual style: ${concept.visual_style}
- Target emotion: ${concept.target_emotion}
- Duration: ${concept.duration_seconds}s (max ${maxWords} spoken words total)

NARRATIVE ARC:
- Setup (0:00–0:10): ${concept.narrative_arc.beat_1_setup}
- Tension (0:10–0:20): ${concept.narrative_arc.beat_2_tension}
- Payoff (0:20–0:30): ${concept.narrative_arc.beat_3_payoff}

Return a VideoScript object:
{
  "concept_id": "${concept.id}",
  "hook_spoken": "Exact words spoken or shown in first 3 seconds",
  "beats": [
    {
      "beat": "setup",
      "timecode": "0:00–0:10",
      "voiceover": "Exact words spoken (max 22 words)",
      "on_screen_text": "MAX 6 WORDS",
      "visual_direction": "What the camera shows"
    },
    {
      "beat": "tension",
      "timecode": "0:10–0:20",
      "voiceover": "Exact words spoken (max 22 words)",
      "on_screen_text": "MAX 6 WORDS",
      "visual_direction": "What the camera shows"
    },
    {
      "beat": "payoff",
      "timecode": "0:20–0:30",
      "voiceover": "Exact words spoken — fewer is better here",
      "on_screen_text": "FINAL TEXT",
      "visual_direction": "Conclusive or loop-able shot"
    }
  ],
  "full_voiceover": "Complete VO text concatenated, ready for TTS",
  "word_count": 42,
  "estimated_speaking_seconds": 19
}

Return ONLY the JSON object.`;
}

// ─── Anthropic API helpers ────────────────────────────────────────────────────

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function cleanJson(text: string): string {
  // Extract content from inside a ```json ... ``` block if present; otherwise use raw text
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1].trim() : text.trim();
}

async function callConceptApi(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  retryNote?: string
): Promise<IdeaConcept[]> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  if (retryNote) {
    messages.push({
      role: "assistant",
      content: "Understood. I will regenerate the concepts with those corrections applied.",
    });
    messages.push({
      role: "user",
      content: `REQUIRED FIXES — apply all of these before returning:\n${retryNote}\n\nReturn ONLY the corrected JSON array.`,
    });
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  const text    = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = cleanJson(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`API returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array from API, got: ${typeof parsed}`);
  }

  return parsed as IdeaConcept[];
}

async function generateScriptForConcept(
  client: Anthropic,
  concept: IdeaConcept,
  session: SessionContext
): Promise<VideoScript> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: buildScriptSystemPrompt(session),
    messages: [{ role: "user", content: buildScriptUserPrompt(concept) }],
  });

  const text    = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = cleanJson(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Script API returned invalid JSON for ${concept.id}: ${cleaned.slice(0, 200)}`);
  }

  const script = parsed as VideoScript;
  if (!script.word_count) {
    script.word_count = (script.full_voiceover ?? "").split(/\s+/).filter(Boolean).length;
  }
  if (!script.estimated_speaking_seconds) {
    script.estimated_speaking_seconds = Math.round((script.word_count / 130) * 60);
  }
  return script;
}

async function generateScriptWithRetry(
  client: Anthropic,
  concept: IdeaConcept,
  session: SessionContext
): Promise<VideoScript> {
  try {
    return await generateScriptForConcept(client, concept, session);
  } catch {
    try {
      return await generateScriptForConcept(client, concept, session);
    } catch {
      // Placeholder script so the pipeline never crashes
      return {
        concept_id: concept.id,
        hook_spoken: "",
        beats: [
          { beat: "setup",   timecode: "0:00–0:10", voiceover: undefined, on_screen_text: undefined, visual_direction: concept.narrative_arc.beat_1_setup },
          { beat: "tension", timecode: "0:10–0:20", voiceover: undefined, on_screen_text: undefined, visual_direction: concept.narrative_arc.beat_2_tension },
          { beat: "payoff",  timecode: "0:20–0:30", voiceover: undefined, on_screen_text: undefined, visual_direction: concept.narrative_arc.beat_3_payoff },
        ],
        full_voiceover: "",
        word_count: 0,
        estimated_speaking_seconds: 0,
      };
    }
  }
}

// ─── Diversity + Quality Validation ──────────────────────────────────────────

function enforceDiversityRules(concepts: IdeaConcept[]): string[] {
  const issues: string[] = [];

  const hasCounterIntuitive = concepts.some(
    (c) =>
      c.virality_reasoning.toLowerCase().includes("counterintuitive") ||
      c.virality_reasoning.toLowerCase().includes("challenges")
  );
  if (!hasCounterIntuitive) {
    issues.push(
      'No counterintuitive concept — virality_reasoning must include "counterintuitive" or "challenges" for one concept'
    );
  }

  const styles = concepts.map((c) => c.visual_style.toLowerCase());
  if (new Set(styles).size < concepts.length) {
    issues.push("Two or more concepts share the same visual_style — each must be unique");
  }

  const emotions = concepts.map((c) => c.target_emotion);
  if (new Set(emotions).size < concepts.length) {
    issues.push("Two or more concepts share the same target_emotion — each must be unique");
  }

  return issues;
}

function checkBannedContent(concepts: IdeaConcept[]): string[] {
  return concepts.flatMap((c) => {
    const found = checkBannedPhrases(`${c.hook} ${c.virality_reasoning} ${c.title}`);
    return found.length > 0
      ? [`Concept "${c.id}" uses banned phrases: ${found.join(", ")} — rewrite`]
      : [];
  });
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { context: SessionContext; remixNote?: string };
    const { context, remixNote } = body;

    if (!context?.topic) {
      return NextResponse.json({ error: "context.topic is required" }, { status: 400 });
    }

    const client = getClient();

    // Build CSV examples for the USER prompt (keyword-scored, 10 examples)
    const keywords = [context.topic, context.brand, context.platform, context.mood].filter(
      (v): v is string => Boolean(v)
    );
    const relevant     = selectRelevantExamples(keywords, 10);
    const csvExamples  = relevant
      .map(
        (ex) =>
          `[${ex.id} · ${ex.metadata}]\n${ex.prompt.slice(0, 350)}${ex.prompt.length > 350 ? "..." : ""}`
      )
      .join("\n\n");

    // Build CSV examples for the SYSTEM prompt (random, category-filtered, 6 examples)
    const category        = mapMoodToCategory(context.mood);
    const systemCsvRows   = getRandomCsvPrompts(6, category);
    const csvSystemExamples = systemCsvRows
      .map((p, i) => `Example ${i + 1}:\n${p.slice(0, 400)}${p.length > 400 ? "..." : ""}`)
      .join("\n\n");

    const systemPrompt = buildConceptSystemPrompt(context, csvSystemExamples);
    const userPrompt   = remixNote
      ? buildConceptUserPrompt(context, csvExamples) + `\n\nREMIX NOTE: ${remixNote}`
      : buildConceptUserPrompt(context, csvExamples);

    // Call 1: Generate concepts
    let concepts = (await callConceptApi(client, systemPrompt, userPrompt)).slice(0, 3);

    // Quality gate — retry once with explicit fixes
    const allIssues = [...enforceDiversityRules(concepts), ...checkBannedContent(concepts)];
    if (allIssues.length > 0) {
      concepts = (await callConceptApi(client, systemPrompt, userPrompt, allIssues.join("\n"))).slice(0, 3);
    }

    // Calls 2–4 (parallel): Script per concept, with retry and placeholder fallback
    const scripts = await Promise.allSettled(
      concepts.map((c) => generateScriptWithRetry(client, c, context))
    );

    // Attach scripts
    concepts = concepts.map((concept, i) => {
      const result = scripts[i];
      if (result.status !== "fulfilled") return concept;
      return { ...concept, script: result.value };
    });

    return NextResponse.json({ ideas: concepts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
