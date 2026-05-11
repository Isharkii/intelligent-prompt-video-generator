"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import confetti from "canvas-confetti";
import { useStudio } from "@/lib/store";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

function VideoPlayer({ src }: { src: string }) {
  return (
    <div
      className="relative rounded-lg overflow-hidden bg-black border border-[var(--border)]"
      style={{ aspectRatio: "9/16", maxHeight: "70vh" }}
    >
      <video
        key={src}
        src={src}
        controls
        autoPlay
        loop
        playsInline
        className="w-full h-full object-cover"
      />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button variant="ghost" size="sm" onClick={copy}>
      {copied ? "COPIED ✓" : "COPY"}
    </Button>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] tracking-widest text-[var(--text-dim)]">{label}</span>
      <span className="font-mono text-[12px] text-[var(--text)]">{value}</span>
    </div>
  );
}

export default function DeliveryScreen() {
  const videoPath      = useStudio((s) => s.videoPath);
  const deliveredShots = useStudio((s) => s.deliveredShots);
  const concept        = useStudio((s) => s.deliveredConcept);
  const caption        = useStudio((s) => s.deliveredCaption);
  const voiceover      = useStudio((s) => s.deliveredVoiceover);
  const reset          = useStudio((s) => s.reset);
  const setStage       = useStudio((s) => s.setStage);

  const [rendering, setRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const handleRender = useCallback(async () => {
    setRendering(true);
    setRenderError(null);
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shots: deliveredShots, caption, voiceover }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.fallback_url) { setRenderedUrl(err.fallback_url); return; }
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      setRenderedUrl(URL.createObjectURL(blob));
    } catch (e) {
      setRenderError(String(e));
    } finally {
      setRendering(false);
    }
  }, [deliveredShots, caption]);

  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#f59e0b", "#fbbf24", "#fde68a", "#f0ede6"],
    });
  }, []);

  const successCount = deliveredShots.filter((s) => s.status === "success").length;
  const captionText  = caption
    ? [caption.hook_line, ...caption.body_lines, caption.cta, caption.hashtags.join(" ")].join("\n")
    : "";

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] px-4 sm:px-8 py-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <h2 className="font-display text-4xl sm:text-5xl tracking-widest">DELIVERED</h2>
          </div>
          {concept && (
            <p className="font-mono text-[12px] text-amber">{concept.title}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: video */}
          <div className="lg:col-span-1 flex justify-center">
            {renderedUrl ? (
              <div className="w-full max-w-xs">
                <VideoPlayer src={renderedUrl} />
                <div className="mt-3 space-y-2">
                  <a href={renderedUrl} download="reel.mp4">
                    <Button variant="primary" size="sm" className="w-full">
                      DOWNLOAD MP4
                    </Button>
                  </a>
                  <Button variant="ghost" size="sm" className="w-full" onClick={handleRender}>
                    RE-RENDER
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="card w-full max-w-xs flex flex-col items-center justify-center gap-4 text-center"
                style={{ aspectRatio: "9/16" }}
              >
                <p className="font-mono text-[11px] text-[var(--text-dim)]">
                  {successCount} shot{successCount !== 1 ? "s" : ""} generated
                </p>
                {renderError && (
                  <p className="font-mono text-[10px] text-red-400">{renderError}</p>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRender}
                  disabled={rendering || successCount === 0}
                >
                  {rendering ? "ASSEMBLING..." : "ASSEMBLE & DOWNLOAD"}
                </Button>
                {videoPath && (
                  <a href={videoPath} download>
                    <Button variant="ghost" size="sm">DOWNLOAD RAW</Button>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Right: details */}
          <div className="lg:col-span-2 space-y-5">

            {/* Stats */}
            <div className="card">
              <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase mb-3">
                Production Summary
              </p>
              <div className="flex flex-wrap gap-4 mb-4">
                <StatItem label="SHOTS"    value={`${successCount}/${deliveredShots.length} generated`} />
                {concept && <StatItem label="FORMAT"   value={concept.format} />}
                {concept && <StatItem label="DURATION" value={`${concept.duration_seconds}s`} />}
                {concept && <StatItem label="VIRALITY" value={`${concept.virality_score}/10`} />}
              </div>

              <div className="space-y-1.5">
                {deliveredShots.map((shot) => (
                  <div key={shot.shot_id} className="flex items-center gap-2">
                    <Badge
                      variant={
                        shot.status === "success" ? "success"
                        : shot.status === "failed" ? "error"
                        : "muted"
                      }
                    >
                      {shot.status}
                    </Badge>
                    <span className="font-mono text-[11px] text-[var(--text-dim)]">
                      {shot.shot_id}
                    </span>
                    {shot.clip_url && (
                      <a
                        href={shot.clip_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] text-amber hover:underline truncate max-w-xs"
                      >
                        {shot.clip_url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Caption */}
            {caption && (
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
                    Caption Copy
                  </p>
                  <CopyButton text={captionText} />
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
            )}

            {/* Voiceover script */}
            {voiceover && (voiceover.shot_01 || voiceover.shot_02 || voiceover.shot_03) && (
              <div className="card space-y-2">
                <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
                  Voiceover — Higgsfield Native Audio
                </p>
                {voiceover.shot_01 && (
                  <div className="flex gap-2">
                    <span className="font-mono text-[9px] text-[var(--text-dim)] w-14 shrink-0 pt-0.5">SHOT 01</span>
                    <p className="font-mono text-[11px] text-amber">{voiceover.shot_01}</p>
                  </div>
                )}
                {voiceover.shot_02 && (
                  <div className="flex gap-2">
                    <span className="font-mono text-[9px] text-[var(--text-dim)] w-14 shrink-0 pt-0.5">SHOT 02</span>
                    <p className="font-mono text-[11px] text-[var(--text-muted)]">{voiceover.shot_02}</p>
                  </div>
                )}
                {voiceover.shot_03 && (
                  <div className="flex gap-2">
                    <span className="font-mono text-[9px] text-[var(--text-dim)] w-14 shrink-0 pt-0.5">SHOT 03</span>
                    <p className="font-mono text-[11px] text-[var(--text-dim)]">{voiceover.shot_03}</p>
                  </div>
                )}
                <p className="font-mono text-[9px] text-[var(--text-dim)] mt-1 border-t border-[var(--border)] pt-2">
                  Audio generated natively by Higgsfield — baked into each clip.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="card space-y-3">
              <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
                What Next?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setStage("ideas")}>
                  PICK ANOTHER CONCEPT
                </Button>
                <Button variant="ghost" size="sm" onClick={reset}>
                  NEW SESSION
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
