import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { LogoRevealConfig } from "../../src/types";

interface LogoRevealProps {
  config: LogoRevealConfig;
  durationFrames?: number;
}

export const LogoReveal: React.FC<LogoRevealProps> = ({ config, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const d = durationFrames ?? durationInFrames;

  const logoScale = spring({ frame, fps, from: 0, to: 1, durationInFrames: 20, delay: 0 });
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Text slides up after logo
  const textY = spring({ frame, fps, from: 24, to: 0, durationInFrames: 18, delay: 14 });
  const textOpacity = interpolate(frame, [14, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Underline draws from left to right
  const lineWidth = interpolate(frame, [20, 38], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tagline fades in last
  const taglineOpacity = interpolate(frame, [34, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Overall fade-out near the end
  const containerOpacity = interpolate(
    frame,
    [d - 10, d],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        opacity: containerOpacity,
        pointerEvents: "none",
      }}
    >
      {config.logoUrl && (
        <div style={{ transform: `scale(${logoScale})`, opacity: logoOpacity }}>
          <Img
            src={config.logoUrl}
            style={{ width: 80, height: 80, objectFit: "contain" }}
          />
        </div>
      )}

      <div
        style={{
          transform: `translateY(${textY}px)`,
          opacity: textOpacity,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily:    "Montserrat, sans-serif",
            fontWeight:    800,
            fontSize:      52,
            color:         "#ffffff",
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          {config.text}
        </span>
      </div>

      {/* Amber underline draw-on */}
      <div
        style={{
          height:          3,
          width:           `${lineWidth}%`,
          maxWidth:        320,
          backgroundColor: "#f59e0b",
          borderRadius:    2,
        }}
      />

      {config.tagline && (
        <span
          style={{
            opacity:       taglineOpacity,
            fontFamily:    "DM Sans, sans-serif",
            fontWeight:    400,
            fontSize:      20,
            color:         "rgba(255,255,255,0.65)",
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          {config.tagline}
        </span>
      )}
    </AbsoluteFill>
  );
};
