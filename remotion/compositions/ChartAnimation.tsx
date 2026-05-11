import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ChartConfig } from "../../src/types";

interface ChartAnimationProps {
  config: ChartConfig;
  durationFrames?: number;
}

const AMBER   = "#f59e0b";
const WHITE   = "#ffffff";
const MUTED   = "rgba(255,255,255,0.4)";
const GRIDCOL = "rgba(255,255,255,0.08)";

export const ChartAnimation: React.FC<ChartAnimationProps> = ({ config, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const dur = durationFrames ?? durationInFrames;

  const containerOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [dur - 10, dur], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const maxValue = Math.max(...config.data.map((d) => d.value), 1);
  const STAGGER  = 5;

  return (
    <AbsoluteFill
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        pointerEvents:  "none",
        opacity:        containerOpacity * fadeOut,
      }}
    >
      <div
        style={{
          background:    "rgba(0,0,0,0.78)",
          backdropFilter: "blur(20px)",
          borderRadius:  20,
          border:        `1px solid rgba(245,158,11,0.25)`,
          padding:       "24px 28px",
          width:         380,
        }}
      >
        {config.title && (
          <p style={{
            fontFamily:    "Montserrat, sans-serif",
            fontWeight:    700,
            fontSize:      14,
            color:         WHITE,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom:  16,
            textAlign:     "center",
          }}>
            {config.title}
          </p>
        )}

        {config.type === "bar" ? (
          <BarChart data={config.data} maxValue={maxValue} frame={frame} fps={fps} stagger={STAGGER} />
        ) : (
          <LineChart data={config.data} maxValue={maxValue} frame={frame} durationInFrames={dur} />
        )}
      </div>
    </AbsoluteFill>
  );
};

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({
  data, maxValue, frame, fps, stagger,
}: {
  data: ChartConfig["data"];
  maxValue: number;
  frame: number;
  fps: number;
  stagger: number;
}) {
  const CHART_HEIGHT = 180;
  const BAR_GAP      = 10;
  const barWidth     = (320 - BAR_GAP * (data.length - 1)) / data.length;

  return (
    <div style={{ position: "relative" }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
        <div key={frac} style={{
          position:        "absolute",
          left:            0,
          right:           0,
          bottom:          frac * CHART_HEIGHT + 24,
          height:          1,
          backgroundColor: GRIDCOL,
        }} />
      ))}

      <div style={{ display: "flex", alignItems: "flex-end", gap: BAR_GAP, height: CHART_HEIGHT + 24, paddingTop: 8 }}>
        {data.map((bar, i) => {
          const delay    = i * stagger;
          const heightFrac = bar.value / maxValue;
          const barH = spring({ frame, fps, from: 0, to: heightFrac * CHART_HEIGHT, durationInFrames: 22, delay });
          const labelOpacity = interpolate(frame - delay - 18, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const color = bar.color ?? (i % 2 === 0 ? AMBER : "rgba(245,158,11,0.45)");

          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <span style={{ opacity: labelOpacity, fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 13, color: WHITE }}>
                {bar.value}
              </span>
              <div style={{ width: "100%", height: barH, backgroundColor: color, borderRadius: "4px 4px 0 0" }} />
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: MUTED, textAlign: "center" }}>
                {bar.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Line Chart ────────────────────────────────────────────────────────────────

function LineChart({
  data, maxValue, frame, durationInFrames,
}: {
  data: ChartConfig["data"];
  maxValue: number;
  frame: number;
  durationInFrames: number;
}) {
  const W = 320;
  const H = 160;

  if (data.length < 2) {
    return (
      <div style={{ width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: MUTED }}>
          Need at least 2 data points
        </span>
      </div>
    );
  }

  const drawProgress = interpolate(frame, [0, Math.min(40, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const n = data.length;
  const stepX = W / (n - 1);

  const points = data.map((d, i) => ({
    x: i * stepX,
    y: H - (d.value / maxValue) * H,
  }));

  // Draw only drawProgress fraction of the line
  const visibleCount = Math.floor(drawProgress * (n - 1));
  const partial      = (drawProgress * (n - 1)) % 1;

  let pathD = "";
  for (let i = 0; i <= visibleCount && i < n - 1; i++) {
    const from = points[i];
    const to   = points[i + 1];
    if (i === 0) pathD += `M ${from.x} ${from.y}`;
    if (i < visibleCount) {
      pathD += ` L ${to.x} ${to.y}`;
    } else {
      // Interpolate partial segment
      const px = from.x + (to.x - from.x) * partial;
      const py = from.y + (to.y - from.y) * partial;
      pathD += ` L ${px} ${py}`;
    }
  }

  return (
    <div>
      <svg width={W} height={H + 24} viewBox={`0 0 ${W} ${H + 24}`}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
          <line key={frac} x1={0} y1={H - frac * H} x2={W} y2={H - frac * H} stroke={GRIDCOL} strokeWidth={1} />
        ))}

        {/* Line */}
        {pathD && (
          <path d={pathD} stroke={AMBER} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Dots at each visible data point */}
        {points.slice(0, visibleCount + 1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={5} fill={AMBER} />
        ))}

        {/* Labels */}
        {data.map((d, i) => (
          <text key={i} x={points[i].x} y={H + 18} textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize={11} fill={MUTED}>
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
