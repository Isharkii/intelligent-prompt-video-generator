import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CTACardConfig } from "../../src/types";

interface CTACardProps {
  config: CTACardConfig;
  durationFrames?: number;
}

export const CTACard: React.FC<CTACardProps> = ({ config, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const d = durationFrames ?? durationInFrames;

  const slideY = spring({ frame, fps, from: 80, to: 0, durationInFrames: 18 });
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [d - 10, d], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Amber button pulse
  const pulse = Math.sin(frame * 0.18) * 0.06 + 1;

  const isBottom = !config.position || config.position === "bottom";

  return (
    <AbsoluteFill
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: isBottom ? "flex-end" : "center",
        paddingBottom:  isBottom ? 72 : 0,
        pointerEvents:  "none",
      }}
    >
      <div
        style={{
          transform: `translateY(${slideY}px)`,
          opacity:   opacity * fadeOut,
          display:   "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           16,
          background:    "rgba(0,0,0,0.72)",
          backdropFilter: "blur(16px)",
          borderRadius:  20,
          border:        "1px solid rgba(245,158,11,0.3)",
          padding:       "24px 32px",
          maxWidth:      360,
          width:         "85%",
        }}
      >
        <span
          style={{
            fontFamily:    "DM Sans, sans-serif",
            fontWeight:    700,
            fontSize:      22,
            color:         "#ffffff",
            textAlign:     "center",
            lineHeight:    1.3,
          }}
        >
          {config.text}
        </span>

        <div
          style={{
            transform:       `scale(${pulse})`,
            backgroundColor: "#f59e0b",
            borderRadius:    40,
            padding:         "14px 32px",
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
          }}
        >
          <span
            style={{
              fontFamily:    "Montserrat, sans-serif",
              fontWeight:    800,
              fontSize:      16,
              color:         "#000000",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {config.ctaText}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
