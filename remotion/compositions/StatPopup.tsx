import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { StatPopupConfig } from "../../src/types";

interface StatPopupProps {
  config: StatPopupConfig;
  durationFrames?: number;
}

export const StatPopup: React.FC<StatPopupProps> = ({ config, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const d = durationFrames ?? durationInFrames;

  const scale = spring({ frame, fps, from: 0.4, to: 1, durationInFrames: 16, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [d - 10, d], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Animate the number from 0 to target
  const countProgress = interpolate(frame, [0, Math.min(40, d)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const displayValue = Math.round(config.value * countProgress);

  return (
    <AbsoluteFill
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        pointerEvents:  "none",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity:   opacity * fadeOut,
          display:   "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           6,
          background:    "rgba(0,0,0,0.78)",
          backdropFilter: "blur(20px)",
          borderRadius:  16,
          border:        "1px solid rgba(245,158,11,0.4)",
          padding:       "20px 36px",
        }}
      >
        <div
          style={{
            display:    "flex",
            alignItems: "baseline",
            gap:        4,
          }}
        >
          {config.prefix && (
            <span
              style={{
                fontFamily:    "Montserrat, sans-serif",
                fontWeight:    700,
                fontSize:      32,
                color:         "#f59e0b",
              }}
            >
              {config.prefix}
            </span>
          )}
          <span
            style={{
              fontFamily:    "Montserrat, sans-serif",
              fontWeight:    800,
              fontSize:      72,
              color:         "#ffffff",
              lineHeight:    1,
            }}
          >
            {displayValue.toLocaleString()}
          </span>
          {config.suffix && (
            <span
              style={{
                fontFamily:    "Montserrat, sans-serif",
                fontWeight:    700,
                fontSize:      32,
                color:         "#f59e0b",
              }}
            >
              {config.suffix}
            </span>
          )}
        </div>

        <span
          style={{
            fontFamily:    "DM Sans, sans-serif",
            fontWeight:    400,
            fontSize:      16,
            color:         "rgba(255,255,255,0.6)",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {config.label}
        </span>

        {/* Amber accent line */}
        <div
          style={{
            marginTop:       6,
            height:          2,
            width:           "60%",
            backgroundColor: "#f59e0b",
            borderRadius:    1,
            opacity:         0.6,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
