"use client";

import { useState } from "react";
import { useStudio } from "@/lib/store";
import { PLATFORMS, GOALS, MOODS, INSPIRATION_TICKERS } from "@/lib/constants";
import type { SessionContext } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import LoadingDots from "@/components/ui/LoadingDots";

function Ticker() {
  const items = [...INSPIRATION_TICKERS, ...INSPIRATION_TICKERS];
  return (
    <div className="overflow-hidden border-y border-[var(--border)] py-2 mb-8 select-none">
      <div className="ticker-inner flex gap-8 whitespace-nowrap w-max">
        {items.map((item, i) => (
          <span
            key={i}
            className="font-mono text-[11px] text-[var(--text-dim)] tracking-wider"
          >
            {item}
            <span className="mx-4 text-[var(--amber-dim)]">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`px-3 py-1.5 rounded-sm font-mono text-[11px] tracking-wider border transition-all duration-150 ${
              value === opt
                ? "bg-[var(--amber-glow)] border-[var(--amber-dim)] text-amber"
                : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-dim)] hover:text-[var(--text)]"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SessionInputScreen() {
  const setContext = useStudio((s) => s.setContext);
  const setIdeas   = useStudio((s) => s.setIdeas);
  const setStage   = useStudio((s) => s.setStage);
  const setError   = useStudio((s) => s.setError);

  const [topic,     setTopic]     = useState("");
  const [brand,     setBrand]     = useState("");
  const [platform,  setPlatform]  = useState("");
  const [goal,      setGoal]      = useState("");
  const [mood,      setMood]      = useState("");
  const [reference, setReference] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [topicErr,  setTopicErr]  = useState("");

  async function handleGenerate() {
    if (!topic.trim()) {
      setTopicErr("Topic is required");
      return;
    }
    setTopicErr("");

    const ctx: SessionContext = {
      topic:    topic.trim(),
      brand:    brand.trim()     || undefined,
      platform: platform.trim() || undefined,
      goal:     goal.trim()     || undefined,
      mood:     mood.trim()     || undefined,
      reference:reference.trim()|| undefined,
    };

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: ctx }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setContext(ctx);
      setIdeas(data.ideas);
      setStage("ideas");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] flex flex-col">
      <Ticker />

      <div className="flex-1 flex items-start justify-center px-4 sm:px-8 pb-16">
        <div className="w-full max-w-2xl space-y-8">

          {/* Headline */}
          <div>
            <h1 className="font-display text-5xl sm:text-7xl tracking-widest text-[var(--text)] leading-none">
              SOCIAL<br />
              <span className="text-amber">STUDIO</span>
            </h1>
            <p className="mt-3 font-mono text-[13px] text-[var(--text-muted)]">
              Autonomous AI video production · type a topic, get a finished reel.
            </p>
          </div>

          <div className="rule" />

          {/* Form */}
          <div className="space-y-6">
            <Input
              label="Topic *"
              placeholder="e.g. morning coffee ritual, sustainable fashion brand launch"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              error={topicErr}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              autoFocus
            />

            <Input
              label="Brand (optional)"
              placeholder="e.g. Nike — athletic, bold, aspirational"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />

            <SegmentedControl
              label="Platform"
              options={PLATFORMS}
              value={platform}
              onChange={setPlatform}
            />

            <SegmentedControl
              label="Goal"
              options={GOALS}
              value={goal}
              onChange={setGoal}
            />

            <SegmentedControl
              label="Mood"
              options={MOODS}
              value={mood}
              onChange={setMood}
            />

            <Input
              label="Reference (optional)"
              placeholder="e.g. a video or creator whose aesthetic you love"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="primary"
              size="lg"
              loading={loading}
              onClick={handleGenerate}
              className="flex-1 sm:flex-none sm:w-48"
            >
              {loading ? <LoadingDots /> : "GENERATE IDEAS"}
            </Button>
            {loading && (
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                Generating concepts...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
