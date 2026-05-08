"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStudio } from "@/lib/store";
import { STAGE_LABELS, PRODUCE_STAGES } from "@/lib/constants";
import type { ProduceStage } from "@/lib/types";
import LoadingDots from "@/components/ui/LoadingDots";

const STATUS_ICONS: Record<string, string> = {
  idle:    "○",
  running: "◎",
  done:    "✓",
  warning: "⚠",
  skipped: "—",
};
const STATUS_COLORS: Record<string, string> = {
  idle:    "text-[var(--text-dim)]",
  running: "text-amber",
  done:    "text-green-400",
  warning: "text-yellow-400",
  skipped: "text-[var(--text-dim)]",
};

function StageRow({ stage }: { stage: ProduceStage }) {
  const progress = useStudio((s) => s.stageProgress[stage]);
  const { status, message } = progress;

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-[var(--border-muted)] transition-opacity duration-300 ${status === "idle" ? "opacity-30" : "opacity-100"}`}>
      <span className={`font-mono text-sm w-4 shrink-0 mt-0.5 ${STATUS_COLORS[status]}`}>
        {STATUS_ICONS[status]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] tracking-wider text-[var(--text-muted)]">
            {STAGE_LABELS[stage]}
          </span>
          {status === "running" && <LoadingDots size={5} />}
        </div>
        {message && (
          <p className={`font-mono text-[12px] mt-0.5 ${STATUS_COLORS[status]}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function ProgressBar() {
  const current = useStudio((s) => s.currentFrame);
  const total   = useStudio((s) => s.totalFrames);
  if (total === 0) return null;
  const pct = Math.round((current / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-[10px] text-[var(--text-dim)]">
        <span>FRAME {current}/{total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-amber rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

function LogPanel() {
  const lines     = useStudio((s) => s.logLines);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="card max-h-64 overflow-y-auto">
      <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase mb-3">
        Production Log
      </p>
      <div className="space-y-1">
        <AnimatePresence initial={false}>
          {lines.map((line, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="font-mono text-[11px] text-[var(--text-dim)] leading-relaxed log-line"
            >
              {line}
            </motion.p>
          ))}
        </AnimatePresence>
        {lines.length === 0 && (
          <p className="font-mono text-[11px] text-[var(--text-dim)]">Initialising pipeline...</p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function ProducingScreen() {
  const stageProgress = useStudio((s) => s.stageProgress);

  const activeStage = PRODUCE_STAGES.find(
    (s) => stageProgress[s].status === "running"
  );

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] px-4 sm:px-8 py-10">
      <div className="max-w-3xl mx-auto space-y-8">

        <div>
          <h2 className="font-display text-4xl sm:text-5xl tracking-widest mb-2">
            PRODUCING
          </h2>
          <p className="font-mono text-[12px] text-[var(--text-muted)]">
            {activeStage
              ? `${STAGE_LABELS[activeStage]}...`
              : "Pipeline running..."}
          </p>
        </div>

        {/* Stage pipeline */}
        <div className="card">
          {PRODUCE_STAGES.map((stage) => (
            <StageRow key={stage} stage={stage} />
          ))}
        </div>

        <ProgressBar />

        <LogPanel />
      </div>
    </div>
  );
}
