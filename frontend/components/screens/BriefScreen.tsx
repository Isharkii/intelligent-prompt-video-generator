"use client";

import { useState, useEffect, useCallback } from "react";
import { useStudio } from "@/lib/store";
import type { ShotPrompt } from "@/lib/types";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

function ShotRow({ shot, i }: { shot: ShotPrompt; i: number }) {
  const [expanded, setExpanded] = useState(false);
  const beatColors: Record<string, string> = {
    setup:   "text-blue-400",
    tension: "text-yellow-400",
    payoff:  "text-green-400",
    broll:   "text-purple-400",
  };
  return (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="w-full flex gap-3 py-3 border-b border-[var(--border-muted)] text-left hover:bg-[var(--bg-elevated)] transition-colors px-1 -mx-1 rounded-sm"
    >
      <span className="font-mono text-[10px] text-[var(--text-dim)] w-8 shrink-0 mt-0.5">
        {String(i + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-mono text-[10px] tracking-widest ${beatColors[shot.narrative_beat] ?? "text-[var(--text-muted)]"}`}>
            {shot.narrative_beat.toUpperCase()}
          </span>
          <Badge variant="muted">{shot.duration_seconds}s</Badge>
          <Badge variant="muted">{shot.style_preset}</Badge>
          <Badge variant="muted">{shot.motion_intensity}</Badge>
        </div>
        <p className={`font-mono text-[12px] text-[var(--text)] leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
          {shot.prompt}
        </p>
        {!expanded && (
          <p className="font-mono text-[10px] text-amber mt-1">click to expand</p>
        )}
      </div>
    </button>
  );
}

function CaptionPreview() {
  const caption = useStudio((s) => s.caption);
  const [copied, setCopied] = useState(false);
  if (!caption) return null;

  const full = [caption.hook_line, ...caption.body_lines, caption.cta, caption.hashtags.join(" ")].join("\n");

  async function copy() {
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
          Caption Copy
        </p>
        <button
          onClick={copy}
          className="font-mono text-[10px] text-amber hover:text-yellow-300 transition-colors"
        >
          {copied ? "COPIED ✓" : "COPY"}
        </button>
      </div>
      <p className="font-serif text-lg italic text-[var(--text)]">{caption.hook_line}</p>
      <div className="space-y-1">
        {caption.body_lines.map((line, i) => (
          <p key={i} className="font-sans text-sm text-[var(--text-muted)]">{line}</p>
        ))}
      </div>
      <p className="font-mono text-xs text-amber">{caption.cta}</p>
      <div className="flex flex-wrap gap-1">
        {caption.hashtags.map((h) => (
          <span key={h} className="font-mono text-[11px] text-[var(--text-dim)]">{h}</span>
        ))}
      </div>
    </div>
  );
}

function NarrativeArcCard() {
  const ideas    = useStudio((s) => s.ideas);
  const selected = useStudio((s) => s.selectedIndex);
  const concept  = ideas[selected];
  if (!concept) return null;
  const { beat_1_setup, beat_2_tension, beat_3_payoff } = concept.narrative_arc;
  return (
    <div className="card space-y-3">
      <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
        Narrative Arc
      </p>
      <div className="flex flex-col gap-0">
        {[
          { label: "SETUP",   text: beat_1_setup,   color: "text-blue-400",   dot: "bg-blue-400" },
          { label: "TENSION", text: beat_2_tension,  color: "text-yellow-400", dot: "bg-yellow-400" },
          { label: "PAYOFF",  text: beat_3_payoff,   color: "text-green-400",  dot: "bg-green-400" },
        ].map((beat, i, arr) => (
          <div key={beat.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${beat.dot}`} />
              {i < arr.length - 1 && (
                <div className="w-px flex-1 bg-[var(--border)] my-1" />
              )}
            </div>
            <div className="pb-3 min-w-0">
              <span className={`font-mono text-[9px] tracking-widest ${beat.color}`}>
                {beat.label}
              </span>
              <p className="font-mono text-[11px] text-[var(--text-muted)] leading-relaxed mt-0.5">
                {beat.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BriefScreen() {
  const shots     = useStudio((s) => s.shots);
  const scenePlan = useStudio((s) => s.scenePlan);
  const ideas     = useStudio((s) => s.ideas);
  const selected  = useStudio((s) => s.selectedIndex);
  const concept   = ideas[selected];

  const setStage      = useStudio((s) => s.setStage);
  const setError      = useStudio((s) => s.setError);
  const updateProgress = useStudio((s) => s.updateProgress);
  const setDelivery   = useStudio((s) => s.setDelivery);
  const appendLog     = useStudio((s) => s.appendLog);
  const context       = useStudio((s) => s.context);

  const handleGo = useCallback(async function handleGo() {
    setStage("producing");
    setError(null);

    const res = await fetch("/api/produce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conceptIndex: selected,
        ideas,
        context,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `HTTP ${res.status}`);
      setStage("brief");
      return;
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const lines = part.split("\n");
        let event = "message";
        let data  = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          if (line.startsWith("data: "))  data  = line.slice(6).trim();
        }
        if (!data) continue;
        try {
          const payload = JSON.parse(data);
          if (event === "progress") {
            updateProgress(payload);
          } else if (event === "done") {
            setDelivery({
              videoPath: payload.videoPath,
              shots:     payload.shots,
              concept:   payload.concept,
              caption:   payload.caption,
            });
            setTimeout(() => setStage("delivery"), 1500);
          } else if (event === "error") {
            setError(payload.message);
            setStage("brief");
          }
        } catch {
          appendLog(data);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ideas, context]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "g" || e.key === "G") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        handleGo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleGo]);

  if (!concept) {
    return (
      <div className="min-h-[calc(100dvh-var(--header-height))] flex items-center justify-center">
        <p className="font-mono text-[var(--text-muted)]">No concept selected.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] px-4 sm:px-8 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h2 className="font-display text-4xl sm:text-5xl tracking-widest mb-2">
            PRODUCTION BRIEF
          </h2>
          <p className="font-mono text-[12px] text-amber">{concept.title}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left: scene info */}
          <div className="lg:col-span-2 space-y-4">
            {/* Meta bar */}
            {scenePlan && (
              <div className="flex flex-wrap gap-3 p-4 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border)]">
                <MetaItem label="DURATION" value={`${Math.round(scenePlan.total_duration_frames / scenePlan.fps)}s`} />
                <MetaItem label="FPS"      value={String(scenePlan.fps)} />
                <MetaItem label="RATIO"    value={scenePlan.aspect_ratio} />
                <MetaItem label="GRADE"    value={scenePlan.global_color_grade} />
                <MetaItem label="MUSIC"    value={scenePlan.music_mood} />
                <MetaItem label="SCENES"   value={String(scenePlan.scenes.length)} />
              </div>
            )}

            {/* Shot list */}
            <div className="card">
              <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase mb-2">
                Shot Queue — {shots.length} shots
              </p>
              {shots.map((shot, i) => (
                <ShotRow key={shot.shot_id} shot={shot} i={i} />
              ))}
            </div>
          </div>

          {/* Right: caption + arc */}
          <div className="space-y-4">
            <NarrativeArcCard />
            <CaptionPreview />
          </div>
        </div>

        {/* GO button */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button
            variant="primary"
            size="lg"
            onClick={handleGo}
            className="min-w-[160px]"
          >
            GO — BEGIN PRODUCTION
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setStage("ideas")}
          >
            BACK
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] tracking-widest text-[var(--text-dim)]">{label}</span>
      <span className="font-mono text-[12px] text-[var(--text)]">{value}</span>
    </div>
  );
}
