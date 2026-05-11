import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SubtitleTrackConfig } from "../../src/types";

interface SubtitleTrackProps {
  config: SubtitleTrackConfig;
}

export const SubtitleTrack: React.FC<SubtitleTrackProps> = ({ config }) => {
  const frame = useCurrentFrame();

  const activeLine = config.lines.find(
    (l) => frame >= l.from_frame && frame <= l.to_frame
  );

  if (!activeLine) return null;

  const lineFrame = frame - activeLine.from_frame;
  const lineDuration = activeLine.to_frame - activeLine.from_frame;

  const fadeIn = interpolate(lineFrame, [0, 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(lineFrame, [lineDuration - 5, lineDuration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = fadeIn * fadeOut;

  const slideY = interpolate(lineFrame, [0, 8], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "flex-end",
        paddingBottom:  100,
        pointerEvents:  "none",
      }}
    >
      <div
        style={{
          opacity,
          transform:     `translateY(${slideY}px)`,
          background:    "rgba(0,0,0,0.62)",
          borderRadius:  8,
          padding:       "8px 20px",
          maxWidth:      "88%",
          textAlign:     "center",
        }}
      >
        <span
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 600,
            fontSize:   28,
            color:      "#ffffff",
            lineHeight: 1.35,
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          }}
        >
          {activeLine.text}
        </span>
      </div>
    </AbsoluteFill>
  );
};
