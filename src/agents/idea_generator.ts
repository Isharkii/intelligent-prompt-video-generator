import Anthropic from "@anthropic-ai/sdk";
import type { SessionContext, IdeaConcept, VideoScript, ScriptBeat } from "../types";
import { training } from "../utils/training_loader";
import { selectRelevantExamples } from "../utils/csv_loader";

const client = new Anthropic();

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

// ─── System / User Prompts for Concept Generation ────────────────────────────

function buildConceptSystemPrompt(
  session: SessionContext,
  csvSystemExamples: string
): string {
  const hookPatterns    = training.getHookPatterns(session.mood);
  const narrativeArcs   = training.getNarrativeArcs();
  const platformRules   = training.getPlatformRules(session.platform ?? "Instagram");
  const bannedPhrases   = training.getBannedPhrases();

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

DIVERSITY RULES — enforce all four:
1. Exactly ONE concept must be counterintuitive: its virality_reasoning must contain "counterintuitive" or "challenges"
2. Exactly ONE must use a trending platform format (duet, POV, day-in-the-life, reaction, etc.)
3. Exactly ONE must be purely visual-led — minimal or no text, maximum imagery
4. No two concepts may share the same visual_style or the same target_emotion

OUTPUT FORMAT:
- Return ONLY a valid JSON array of 4 IdeaConcept objects
- No markdown fences, no preamble, no trailing text
- Every field in the schema is required`;
}

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

Return a JSON array of exactly 4 concepts. Each object must follow this schema:
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

// ─── Script Generation ────────────────────────────────────────────────────────

function buildScriptSystemPrompt(session: SessionContext): string {
  const platformRules = training.getPlatformRules(session.platform ?? "Instagram");
  const bannedPhrases = training.getBannedPhrases();

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

function buildScriptUserPrompt(concept: IdeaConcept, session: SessionContext): string {
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

async function generateScriptForConcept(
  concept: IdeaConcept,
  session: SessionContext
): Promise<VideoScript> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: buildScriptSystemPrompt(session),
    messages: [{ role: "user", content: buildScriptUserPrompt(concept, session) }],
  });

  const text    = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();

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

/** Retry once on failure, then return a placeholder script so display never crashes. */
async function generateScriptWithRetry(
  concept: IdeaConcept,
  session: SessionContext
): Promise<VideoScript> {
  try {
    return await generateScriptForConcept(concept, session);
  } catch (firstErr) {
    console.warn(`⚠  Script attempt 1 failed for ${concept.id} — retrying: ${String(firstErr)}`);
    try {
      return await generateScriptForConcept(concept, session);
    } catch (secondErr) {
      console.warn(`⚠  Script retry failed for ${concept.id} — attaching placeholder: ${String(secondErr)}`);
      return makePlaceholderScript(concept);
    }
  }
}

function makePlaceholderScript(concept: IdeaConcept): VideoScript {
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

// ─── Script Validators ────────────────────────────────────────────────────────

function validateScriptTiming(script: VideoScript, duration_seconds: number): boolean {
  const maxWords  = Math.round((duration_seconds / 60) * 130);
  const actual    = script.word_count ||
    (script.full_voiceover ?? "").split(/\s+/).filter(Boolean).length;
  if (actual > maxWords) {
    console.warn(
      `⚠  Script ${script.concept_id} runs long — ${actual} words for ${duration_seconds}s (max ${maxWords})`
    );
    return false;
  }
  return true;
}

function checkScriptBannedPhrases(script: VideoScript): void {
  script.beats.forEach((beat, i) => {
    if (!beat.voiceover?.trim()) return;
    const found = training.checkBannedPhrases(beat.voiceover);
    found.forEach((phrase) => {
      console.warn(
        `⚠  Banned phrase "${phrase}" found in concept ${script.concept_id} script beat ${i + 1}`
      );
    });
  });
}

// ─── Concept API Call ─────────────────────────────────────────────────────────

async function callConceptApi(
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
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();

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

// ─── Validation ───────────────────────────────────────────────────────────────

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
    const found = training.checkBannedPhrases(`${c.hook} ${c.virality_reasoning} ${c.title}`);
    return found.length > 0
      ? [`Concept "${c.id}" uses banned phrases: ${found.join(", ")} — rewrite`]
      : [];
  });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generateIdeas(
  context: SessionContext,
  remixNote?: string
): Promise<IdeaConcept[]> {
  // Build CSV examples for the USER prompt (keyword-scored, 10 examples)
  const csvData    = training.getCsvData();
  const keywords   = [context.topic, context.brand, context.platform, context.mood].filter(
    (v): v is string => Boolean(v)
  );
  const relevant   = selectRelevantExamples(csvData, keywords, 10);
  const csvExamples = relevant
    .map(
      (ex) =>
        `[${ex.id} · ${ex.metadata}]\n${ex.prompt.slice(0, 350)}${ex.prompt.length > 350 ? "..." : ""}`
    )
    .join("\n\n");

  // Build CSV examples for the SYSTEM prompt (random, category-filtered, 6 examples)
  const category        = mapMoodToCategory(context.mood);
  const systemCsvRows   = training.getRandomCsvPrompts(6, category);
  const csvSystemExamples = systemCsvRows
    .map((p, i) => `Example ${i + 1}:\n${p.slice(0, 400)}${p.length > 400 ? "..." : ""}`)
    .join("\n\n");

  console.log(
    `💉 System prompt CSV injection: ${systemCsvRows.length} examples` +
      (category ? ` (category: ${category})` : " (all categories)")
  );

  const systemPrompt = buildConceptSystemPrompt(context, csvSystemExamples);
  const userPrompt   = remixNote
    ? buildConceptUserPrompt(context, csvExamples) + `\n\nREMIX NOTE: ${remixNote}`
    : buildConceptUserPrompt(context, csvExamples);

  // Call 1: Generate concepts
  let concepts = (await callConceptApi(systemPrompt, userPrompt)).slice(0, 4);

  // Quality gate — retry once with explicit fixes
  const allIssues = [...enforceDiversityRules(concepts), ...checkBannedContent(concepts)];
  if (allIssues.length > 0) {
    console.log(`⚠  Quality check — regenerating:\n${allIssues.map((i) => `  • ${i}`).join("\n")}`);
    concepts = (await callConceptApi(systemPrompt, userPrompt, allIssues.join("\n"))).slice(0, 4);
  }

  // Calls 2–5 (parallel): Script per concept, with retry and placeholder fallback
  console.log("✍  Writing scripts for all concepts...");
  const scripts = await Promise.allSettled(
    concepts.map((c) => generateScriptWithRetry(c, context))
  );

  // Attach scripts — run validators on each
  concepts = concepts.map((concept, i) => {
    const result = scripts[i];
    if (result.status !== "fulfilled") {
      // Should never reach here because generateScriptWithRetry always resolves
      return concept;
    }
    const script = result.value;

    // Timing validation (warn only)
    validateScriptTiming(script, concept.duration_seconds);

    // Banned phrase check on all voiceover beats (warn only)
    checkScriptBannedPhrases(script);

    return { ...concept, script };
  });

  return concepts;
}

// ─── Display ──────────────────────────────────────────────────────────────────

function formatScript(script: VideoScript): string {
  const beats = script.beats
    .map(
      (b: ScriptBeat) =>
        `  [${b.timecode}] ${b.beat.toUpperCase()}\n` +
        (b.voiceover        ? `    VO  : "${b.voiceover}"\n`        : "") +
        (b.on_screen_text   ? `    TEXT: ${b.on_screen_text}\n`     : "") +
        `    CAM : ${b.visual_direction}`
    )
    .join("\n");

  return (
    `  Hook: "${script.hook_spoken}"\n` +
    beats +
    `\n  ─ ${script.word_count} words · ~${script.estimated_speaking_seconds}s spoken`
  );
}

function getScriptPreview(script: VideoScript): string {
  const firstBeat = script.beats.find((b) => b.voiceover?.trim());
  if (!firstBeat?.voiceover) return "";
  const words    = firstBeat.voiceover.split(/\s+/);
  const preview  = words.slice(0, 15).join(" ");
  return `Script preview: "${preview}${words.length > 15 ? "..." : ""}"`;
}

export function formatIdeasForDisplay(ideas: IdeaConcept[]): string {
  const cards = ideas
    .map(
      (c, i) =>
        `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPT ${i + 1} — ${c.title.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hook       : ${c.hook}
${c.script ? getScriptPreview(c.script) : ""}
Format     : ${c.format} · ${c.duration_seconds}s
Emotion    : ${c.target_emotion}
Visual     : ${c.visual_style}
Arc        : ${c.narrative_arc.beat_1_setup}
           → ${c.narrative_arc.beat_2_tension}
           → ${c.narrative_arc.beat_3_payoff}
Virality   : ${c.virality_score}/10 — ${c.virality_reasoning}
${
  c.script
    ? `\nSCRIPT:\n${formatScript(c.script)}`
    : "\nScript: (not generated)"
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .join("\n");

  return (
    cards +
    "\n\nWhich concept do you want to produce? (1 / 2 / 3 / 4)\nOr type REMIX to get 3–4 new variations.\n"
  );
}
