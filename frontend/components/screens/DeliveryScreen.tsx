"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useStudio } from "@/lib/store";
import { API_BASE_URL } from "@/lib/constants";
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

export default function DeliveryScreen() {
  const videoPath      = useStudio((s) => s.videoPath);
  const deliveredShots = useStudio((s) => s.deliveredShots);
  const concept        = useStudio((s) => s.deliveredConcept);
  const caption        = useStudio((s) => s.deliveredCaption);
  const reset          = useStudio((s) => s.reset);
  const setStage       = useStudio((s) => s.setStage);
  const updateProgress   = useStudio((s) => s.updateProgress);
  const setError         = useStudio((s) => s.setError);
  const setDelivery      = useStudio((s) => s.setDelivery);

  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ["#f59e0b", "#fbbf24", "#fde68a", "#f0ede6"] });
  }, []);

  const successCount  = deliveredShots.filter((s) => s.status === "success").length;
  const hasFailures   = deliveredShots.some((s) => s.status !== "success");
  const captionText  = caption
    ? [caption.hook_line, ...caption.body_lines, caption.cta, caption.hashtags.join(" ")].join("\n")
    : "";

  async function handleResize() {
    const res = await fetch("/api/resize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formats: ["1:1", "16:9"] }),
    });
    if (!res.ok) alert("Resize failed");
    else alert("Resize jobs queued — check output/ folder.");
  }

  async function handleRetry() {
    const res = await fetch("/api/retry", { method: "POST" });

    // Non-streaming error (409/400)
    const ct = res.headers.get("Content-Type") ?? "";
    if (!ct.includes("text/event-stream")) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Retry failed: HTTP ${res.status}`);
      return;
    }

    setStage("producing");
    setError(null);

    const reader  = res.body?.getReader();
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
              concept:   payload.concept ?? concept!,
              caption:   payload.caption ?? caption!,
            });
            setTimeout(() => setStage("delivery"), 1500);
          } else if (event === "error") {
            setError(payload.message);
            setStage("delivery");
          }
        } catch { /* non-JSON line */ }
      }
    }
  }

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
            {videoPath ? (
              <div className="w-full max-w-xs">
                <VideoPlayer src={`${API_BASE_URL}${videoPath}`} />
                <div className="mt-3 flex gap-2">
                  <a
                    href={`${API_BASE_URL}${videoPath}`}
                    download
                    className="flex-1"
                  >
                    <Button variant="primary" size="sm" className="w-full">
                      DOWNLOAD MP4
                    </Button>
                  </a>
                </div>
              </div>
            ) : (
              <div className="card w-full max-w-xs flex items-center justify-center" style={{ aspectRatio: "9/16" }}>
                <p className="font-mono text-[11px] text-[var(--text-dim)]">No video path</p>
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
              <div className="flex flex-wrap gap-4">
                <StatItem label="SHOTS" value={`${successCount}/${deliveredShots.length} generated`} />
                {concept && <StatItem label="FORMAT"    value={concept.format} />}
                {concept && <StatItem label="DURATION"  value={`${concept.duration_seconds}s`} />}
                {concept && <StatItem label="VIRALITY"  value={`${concept.virality_score}/10`} />}
              </div>

              {/* Shot statuses */}
              <div className="mt-4 space-y-1">
                {deliveredShots.map((shot) => (
                  <div key={shot.shot_id} className="flex items-center gap-2">
                    <Badge
                      variant={
                        shot.status === "success"
                          ? "success"
                          : shot.status === "failed"
                          ? "error"
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

            {/* Post-delivery actions */}
            <div className="card space-y-3">
              <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
                What Next?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleResize}>
                  RESIZE → 1:1 + 16:9
                </Button>
                <Button
                  variant={hasFailures ? "primary" : "secondary"}
                  size="sm"
                  onClick={handleRetry}
                >
                  {hasFailures ? "⚠ RETRY FAILED SHOTS" : "RETRY / RE-RENDER"}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setStage("brief")}>
                  RECUT
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

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] tracking-widest text-[var(--text-dim)]">{label}</span>
      <span className="font-mono text-[12px] text-[var(--text)]">{value}</span>
    </div>
  );
}
