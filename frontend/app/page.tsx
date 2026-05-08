"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStudio } from "@/lib/store";
import type { AppStage } from "@/lib/store";
import SessionInputScreen  from "@/components/screens/SessionInputScreen";
import IdeasScreen          from "@/components/screens/IdeasScreen";
import ProducingScreen      from "@/components/screens/ProducingScreen";
import DeliveryScreen       from "@/components/screens/DeliveryScreen";
import TrainingEditorScreen from "@/components/screens/TrainingEditorScreen";

// Brief is no longer in the main flow — Claude decides prompts autonomously
const STAGE_ORDER: AppStage[] = ["input", "ideas", "producing", "delivery"] as const;

const STAGE_LABELS: Partial<Record<AppStage, string>> = {
  input:     "SESSION",
  ideas:     "IDEAS",
  producing: "PRODUCING",
  delivery:  "DELIVERED",
};

function StageIndicator({ current }: { current: AppStage }) {
  const currentIdx = STAGE_ORDER.indexOf(current as typeof STAGE_ORDER[number]);
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-1 sm:gap-2">
          <div
            className={`flex items-center gap-1 transition-all duration-300 ${
              i === currentIdx ? "opacity-100" : i < currentIdx ? "opacity-40" : "opacity-20"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                i < currentIdx ? "bg-amber" : i === currentIdx ? "bg-amber pulse" : "bg-[var(--text-dim)]"
              }`}
            />
            <span
              className={`hidden sm:block text-[10px] font-mono tracking-widest ${
                i === currentIdx ? "text-amber" : "text-[var(--text-dim)]"
              }`}
            >
              {STAGE_LABELS[s]}
            </span>
          </div>
          {i < STAGE_ORDER.length - 1 && (
            <div
              className={`w-4 sm:w-8 h-px transition-colors duration-300 ${
                i < currentIdx ? "bg-[var(--amber-dim)]" : "bg-[var(--border)]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Header() {
  const stage       = useStudio((s) => s.stage);
  const reset       = useStudio((s) => s.reset);
  const setStage    = useStudio((s) => s.setStage);
  const isProducing = stage === "producing";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-8"
      style={{
        height:       "var(--header-height)",
        background:   "rgba(10,10,10,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button onClick={reset} className="flex items-center gap-2 group" title="Return to start">
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${isProducing ? "bg-red-500 pulse" : "bg-amber pulse"}`} />
        <span className="font-display text-base sm:text-lg tracking-widest text-[var(--text)] group-hover:text-amber transition-colors">
          STUDIO
        </span>
        {isProducing && (
          <span className="font-mono text-[9px] tracking-widest text-red-400 hidden sm:block">REC</span>
        )}
      </button>

      <StageIndicator current={stage} />

      <div className="flex items-center gap-4">
        <button
          onClick={() => setStage(stage === "training" ? "input" : "training")}
          className={`font-mono text-[11px] tracking-widest transition-colors hidden sm:block ${
            stage === "training" ? "text-amber" : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
          }`}
        >
          {stage === "training" ? "← BACK" : "TRAINING"}
        </button>
        <span className="font-mono text-[10px] text-[var(--text-dim)] hidden sm:block">v3.0</span>
      </div>
    </header>
  );
}

function ErrorBanner() {
  const error    = useStudio((s) => s.error);
  const setError = useStudio((s) => s.setError);
  if (!error) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="fixed top-[var(--header-height)] left-0 right-0 z-40 bg-red-950 border-b border-red-800 px-4 sm:px-8 py-3 flex items-center justify-between gap-4"
    >
      <p className="font-mono text-[12px] text-red-300 flex-1 truncate">{error}</p>
      <button
        onClick={() => setError(null)}
        className="font-mono text-[11px] text-red-400 hover:text-red-200 shrink-0"
      >
        DISMISS ×
      </button>
    </motion.div>
  );
}

const TITLE_BY_STAGE: Record<string, string> = {
  input:     "STUDIO — New Session",
  ideas:     "STUDIO — Pick a Concept",
  producing: "STUDIO — Claude is Producing...",
  delivery:  "STUDIO — Ready",
  training:  "STUDIO — Training Editor",
};

function ScreenSwitch() {
  const stage = useStudio((s) => s.stage);

  useEffect(() => {
    document.title = TITLE_BY_STAGE[stage] ?? "STUDIO";
  }, [stage]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="w-full"
      >
        {stage === "input"     && <SessionInputScreen />}
        {stage === "ideas"     && <IdeasScreen />}
        {stage === "producing" && <ProducingScreen />}
        {stage === "delivery"  && <DeliveryScreen />}
        {stage === "training"  && <TrainingEditorScreen />}
      </motion.div>
    </AnimatePresence>
  );
}

export default function Home() {
  return (
    <main className="min-h-dvh w-full" style={{ paddingTop: "var(--header-height)" }}>
      <Header />
      <AnimatePresence>
        <ErrorBanner />
      </AnimatePresence>
      <ScreenSwitch />
    </main>
  );
}
