"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStudio } from "@/lib/store";
import type { GeneratedShot, CaptionCopy, IdeaConcept } from "@/lib/types";

// ─── Tool call pill ────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  generate_video: "generate_video",
  job_status:     "job_status",
  job_display:    "job_display",
  lipsync:        "lipsync",
};

function ToolPill({ name, done }: { name: string; done: boolean }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm font-mono text-[10px] tracking-wider border ${
        done
          ? "bg-green-950 border-green-800 text-green-400"
          : "bg-amber/10 border-amber/30 text-amber"
      }`}
    >
      {done ? "✓" : <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse inline-block" />}
      {TOOL_LABELS[name] ?? name}
    </motion.span>
  );
}

// ─── Claude text stream ────────────────────────────────────────────────────────

function ClaudeStream({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [text]);

  // Highlight ```json blocks
  const parts = text.split(/(```json[\s\S]*?```)/g);

  return (
    <div
      ref={ref}
      className="card max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed text-[var(--text-muted)] space-y-0.5"
    >
      <p className="font-mono text-[10px] tracking-widest text-[var(--text-dim)] uppercase mb-3">
        Claude&rsquo;s Output
      </p>
      {text ? (
        parts.map((part, i) =>
          part.startsWith("```json") ? (
            <pre
              key={i}
              className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-sm p-2 text-green-400 text-[10px] overflow-x-auto whitespace-pre-wrap"
            >
              {part}
            </pre>
          ) : (
            <span key={i} className="whitespace-pre-wrap">{part}</span>
          )
        )
      ) : (
        <span className="text-[var(--text-dim)]">Waiting for Claude...</span>
      )}
      {/* blinking cursor */}
      <span className="inline-block w-1.5 h-3 bg-amber opacity-80 animate-pulse ml-0.5" />
    </div>
  );
}

// ─── Shot result cards ────────────────────────────────────────────────────────

function ShotCard({ shot }: { shot: GeneratedShot }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-3 rounded-sm border border-[var(--border)] bg-[var(--bg-elevated)]"
    >
      <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${shot.status === "success" ? "bg-green-400" : "bg-red-400"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)]">
            {shot.shot_id}
          </span>
          <span className={`font-mono text-[9px] ${shot.status === "success" ? "text-green-400" : "text-red-400"}`}>
            {shot.status}
          </span>
        </div>
        {shot.clip_url && (
          <a
            href={shot.clip_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-amber hover:underline truncate block"
          >
            {shot.clip_url}
          </a>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProducingScreen() {
  const concept          = useStudio((s) => s.produceTarget);
  const context          = useStudio((s) => s.context);
  const claudeText       = useStudio((s) => s.claudeText);
  const toolCalls        = useStudio((s) => s.toolCalls);
  const produceStatus    = useStudio((s) => s.produceStatus);
  const appendClaudeText = useStudio((s) => s.appendClaudeText);
  const pushToolCall     = useStudio((s) => s.pushToolCall);
  const completeToolCall = useStudio((s) => s.completeToolCall);
  const setProduceStatus = useStudio((s) => s.setProduceStatus);
  const setDelivery      = useStudio((s) => s.setDelivery);
  const setStage         = useStudio((s) => s.setStage);
  const setError         = useStudio((s) => s.setError);

  const [shots, setShots]   = useState<GeneratedShot[]>([]);
  const [done,  setDone]    = useState(false);
  const startedRef          = useRef(false);

  useEffect(() => {
    if (startedRef.current || !concept || !context) return;
    startedRef.current = true;

    void (async () => {
      try {
        setProduceStatus("Claude is reading your concept...");

        const res = await fetch("/api/produce", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ concept, context }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? `HTTP ${res.status}`);
          setStage("ideas");
          return;
        }

        const reader  = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        let buffer = "";

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

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

              if (event === "text") {
                appendClaudeText(payload.chunk as string);

              } else if (event === "tool") {
                if (payload.done) {
                  completeToolCall(payload.name as string);
                } else {
                  pushToolCall(payload.name as string);
                  const label: Record<string, string> = {
                    generate_video: "Generating video clip...",
                    job_status:     "Checking job status...",
                    job_display:    "Retrieving clip URL...",
                    lipsync:        "Applying lipsync...",
                  };
                  setProduceStatus(label[payload.name as string] ?? `Calling ${payload.name}...`);
                }

              } else if (event === "progress") {
                setProduceStatus(payload.message as string);

              } else if (event === "done") {
                const p = payload as {
                  shots: GeneratedShot[];
                  caption: CaptionCopy | null;
                  concept: IdeaConcept;
                  videoPath: string;
                };
                setShots(p.shots ?? []);
                setDone(true);
                setDelivery({
                  videoPath: p.videoPath ?? "",
                  shots:     p.shots     ?? [],
                  concept:   p.concept   ?? concept,
                  caption:   p.caption   ?? null,
                });
                setTimeout(() => setStage("delivery"), 1200);

              } else if (event === "error") {
                setError(payload.message as string);
                setStage("ideas");
              }
            } catch { /* non-JSON line */ }
          }
        }
      } catch (err) {
        setError(String(err));
        setStage("ideas");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] px-4 sm:px-8 py-10">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-2.5 h-2.5 rounded-full ${done ? "bg-green-400" : "bg-red-500 animate-pulse"}`} />
            <h2 className="font-display text-4xl sm:text-5xl tracking-widest">
              {done ? "COMPLETE" : "PRODUCING"}
            </h2>
          </div>
          {concept && (
            <p className="font-mono text-[12px] text-amber">{concept.title}</p>
          )}
          {produceStatus && (
            <p className="font-mono text-[11px] text-[var(--text-muted)] mt-1">
              {produceStatus}
            </p>
          )}
        </div>

        {/* Tool call feed */}
        {toolCalls.length > 0 && (
          <div className="card">
            <p className="font-mono text-[10px] tracking-widest text-[var(--text-dim)] uppercase mb-3">
              Claude&rsquo;s Tool Calls
            </p>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {toolCalls.map((t, i) => (
                  <ToolPill key={`${t.name}-${i}`} name={t.name} done={t.done} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Live Claude text */}
        <ClaudeStream text={claudeText} />

        {/* Shot results */}
        {shots.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
              Generated Shots — {shots.filter((s) => s.status === "success").length}/{shots.length}
            </p>
            {shots.map((shot) => (
              <ShotCard key={shot.shot_id} shot={shot} />
            ))}
          </div>
        )}

        {done && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono text-[12px] text-green-400"
          >
            ✓ Navigating to delivery...
          </motion.p>
        )}
      </div>
    </div>
  );
}
