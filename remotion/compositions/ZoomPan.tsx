import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ZoomPanConfig } from "../../src/types";

interface ZoomPanProps {
  config: ZoomPanConfig;
  children: React.ReactNode;
  /**
   * Duration of the enclosing Sequence in frames.
   * MUST be passed when ZoomPan is rendered inside a Sequence — useVideoConfig()
   * returns the composition total, not the Sequence duration, so the animation
   * would be proportionally wrong without this prop.
   * Defaults to useVideoConfig().durationInFrames for standalone preview use.
   */
  durationFrames?: number;
}

export const ZoomPan: React.FC<ZoomPanProps> = ({ config, children, durationFrames }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const duration = durationFrames ?? durationInFrames;

  const progress = interpolate(frame, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const intensity = config.intensity ?? 0.08;
  const scale = 1 + intensity * progress;

  const xOrigins: Record<ZoomPanConfig["direction"], string> = {
    in:       "center",
    in_left:  "left",
    in_right: "right",
    in_up:    "center",
    in_down:  "center",
  };

  const yOrigins: Record<ZoomPanConfig["direction"], string> = {
    in:       "center",
    in_left:  "center",
    in_right: "center",
    in_up:    "top",
    in_down:  "bottom",
  };

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: `${xOrigins[config.direction]} ${yOrigins[config.direction]}`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
