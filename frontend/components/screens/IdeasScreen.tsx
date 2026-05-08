"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useStudio } from "@/lib/store";
import { EMOTION_COLORS } from "@/lib/constants";
import type { IdeaConcept } from "@/lib/types";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import LoadingDots from "@/components/ui/LoadingDots";

function ConceptCard({
  concept,
  index,
  selected,
  onSelect,
  onProduce,
}: {
  concept: IdeaConcept;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onProduce: () => void;
}) {
  const scriptPreview = concept.script?.hook_spoken
    ? concept.script.hook_spoken.split(" ").slice(0, 12).join(" ") + "…"
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={`card card-hover relative cursor-pointer ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      {/* Large decorative number */}
      <span className="font-display text-[80px] sm:text-[100px] leading-none text-[var(--border)] select-none absolute top-2 right-4 pointer-events-none">
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Checkmark when selected */}
      {selected && (
        <div className="absolute top-3 left-3 w-5 h-5 rounded-full bg-amber flex items-center justify-center">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#0a0a0a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      <div className="pr-16 pt-1">
        {/* Virality + format */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="amber">{concept.virality_score}/10</Badge>
          <Badge variant="muted">{concept.format}</Badge>
          <Badge variant="muted">{concept.duration_seconds}s</Badge>
        </div>

        <h3 className="font-display text-xl sm:text-2xl tracking-wider text-[var(--text)] mb-2 leading-tight">
          {concept.title}
        </h3>

        <p className="font-serif italic text-sm text-[var(--text-muted)] mb-3">
          &ldquo;{concept.hook}&rdquo;
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <Badge
            variant="muted"
            className={EMOTION_COLORS[concept.target_emotion] ?? ""}
          >
            {concept.target_emotion}
          </Badge>
          <Badge variant="muted">{concept.shot_count} shots</Badge>
        </div>

        {/* Script preview */}
        {scriptPreview ? (
          <p className="font-mono text-[11px] text-amber italic mb-2">
            &ldquo;{scriptPreview}&rdquo;
          </p>
        ) : (
          <p className="font-mono text-[11px] text-[var(--text-dim)] mb-2 line-clamp-2">
            {concept.visual_style}
          </p>
        )}

        {/* Expanded details when selected */}
        {selected && (
          <div className="mt-3 pt-3 border-t border-[var(--amber-dim)] space-y-2">
            {[
              { label: "SETUP",   text: concept.narrative_arc.beat_1_setup },
              { label: "TENSION", text: concept.narrative_arc.beat_2_tension },
              { label: "PAYOFF",  text: concept.narrative_arc.beat_3_payoff },
            ].map((b) => (
              <div key={b.label} className="flex gap-2">
                <span className="font-mono text-[9px] tracking-widest text-amber shrink-0 mt-0.5 w-14">
                  {b.label}
                </span>
                <p className="font-mono text-[11px] text-[var(--text-muted)] leading-relaxed">{b.text}</p>
              </div>
            ))}
            <p className="font-mono text-[10px] text-[var(--text-dim)] leading-relaxed mt-2">
              {concept.virality_reasoning}
            </p>
          </div>
        )}

        {/* Per-card CTA button when selected */}
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); onProduce(); }}
            className="mt-4 w-full py-2.5 bg-amber text-[#0a0a0a] font-mono text-sm tracking-wider font-semibold rounded-sm hover:bg-yellow-400 active:scale-[0.98] transition-all"
          >
            PRODUCE THIS →
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function IdeasScreen() {
  const ideas         = useStudio((s) => s.ideas);
  const selectedIndex = useStudio((s) => s.selectedIndex);
  const selectIdea    = useStudio((s) => s.selectIdea);
  const context       = useStudio((s) => s.context);
  const setStage      = useStudio((s) => s.setStage);
  const setBrief      = useStudio((s) => s.setBrief);
  const setIdeas      = useStudio((s) => s.setIdeas);
  const setError      = useStudio((s) => s.setError);

  const [loading,  setLoading]  = useState(false);
  const [remixing, setRemixing] = useState(false);

  const handleProduce = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/write-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept: ideas[selectedIndex], context }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setBrief(data);
      setStage("brief");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedIndex, ideas, context, setBrief, setStage, setError]);

  async function handleRemix() {
    if (!context) return;
    setRemixing(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIdeas(data.ideas);
      selectIdea(0);
    } catch (err) {
      setError(String(err));
    } finally {
      setRemixing(false);
    }
  }

  // Keyboard: 1-4 select card, Enter produces
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= ideas.length) {
        selectIdea(num - 1);
        return;
      }
      if (e.key === "Enter") {
        handleProduce();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ideas.length, selectIdea, handleProduce]);

  if (!ideas.length) {
    return (
      <div className="min-h-[calc(100dvh-var(--header-height))] flex items-center justify-center">
        <p className="font-mono text-[var(--text-muted)]">No ideas generated yet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] px-4 sm:px-8 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <h2 className="font-display text-4xl sm:text-5xl tracking-widest mb-1">
              CHOOSE A CONCEPT
            </h2>
            {context && (
              <p className="font-mono text-[12px] text-[var(--text-muted)]">
                {context.topic}
                {context.platform && <> · {context.platform}</>}
                {context.mood && <> · {context.mood}</>}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={remixing}
            onClick={handleRemix}
          >
            {remixing ? <LoadingDots size={5} /> : "REMIX ALL ↺"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {ideas.map((concept, i) => (
            <ConceptCard
              key={concept.id}
              concept={concept}
              index={i}
              selected={selectedIndex === i}
              onSelect={() => selectIdea(i)}
              onProduce={handleProduce}
            />
          ))}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <Button
            variant="primary"
            size="lg"
            loading={loading}
            onClick={handleProduce}
          >
            {loading ? <LoadingDots /> : `PRODUCE CONCEPT ${selectedIndex + 1}`}
          </Button>
          <Button variant="ghost" size="md" onClick={() => setStage("input")}>
            BACK
          </Button>
          <span className="font-mono text-[10px] text-[var(--text-dim)] hidden sm:block">
            Press 1–{ideas.length} to select · Enter to produce
          </span>
        </div>
      </div>
    </div>
  );
}
