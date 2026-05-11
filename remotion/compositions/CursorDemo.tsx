import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CursorDemoConfig } from "../../src/types";

interface CursorDemoProps {
  config: CursorDemoConfig;
  durationFrames?: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export const CursorDemo: React.FC<CursorDemoProps> = ({ config, durationFrames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const d = durationFrames ?? durationInFrames;

  const { waypoints, clickFrames = [] } = config;
  if (waypoints.length < 2) return null;

  // Find which segment we're currently in
  let cursorX = waypoints[0].x;
  let cursorY = waypoints[0].y;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to   = waypoints[i + 1];
    if (frame >= from.frame && frame <= to.frame) {
      const t = (frame - from.frame) / (to.frame - from.frame);
      const eased = easeInOut(t);
      cursorX = lerp(from.x, to.x, eased);
      cursorY = lerp(from.y, to.y, eased);
      break;
    } else if (frame > waypoints[waypoints.length - 1].frame) {
      cursorX = waypoints[waypoints.length - 1].x;
      cursorY = waypoints[waypoints.length - 1].y;
    }
  }

  // Determine click ripple state — find most recent click within 20 frames
  let rippleProgress = 0;
  let isClicking = false;
  for (const clickFrame of clickFrames) {
    const delta = frame - clickFrame;
    if (delta >= 0 && delta < 20) {
      rippleProgress = delta / 20;
      isClicking = delta < 6;
    }
  }

  const rippleScale = interpolate(rippleProgress, [0, 1], [0.2, 2.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rippleOpacity = interpolate(rippleProgress, [0, 0.4, 1], [0.8, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const containerOpacity = interpolate(frame, [d - 10, d], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const px = (cursorX / 100) * width;
  const py = (cursorY / 100) * height;

  return (
    <AbsoluteFill style={{ opacity: containerOpacity, pointerEvents: "none" }}>
      {/* Click ripple */}
      {rippleProgress > 0 && (
        <div
          style={{
            position:        "absolute",
            left:            px,
            top:             py,
            width:           40,
            height:          40,
            borderRadius:    "50%",
            border:          "2px solid #f59e0b",
            transform:       `translate(-50%, -50%) scale(${rippleScale})`,
            opacity:         rippleOpacity,
          }}
        />
      )}

      {/* Cursor arrow */}
      <div
        style={{
          position:  "absolute",
          left:      px,
          top:       py,
          transform: `translate(-4px, -4px) scale(${isClicking ? 0.85 : 1})`,
          width:     0,
          height:    0,
        }}
      >
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
          <path
            d="M3 3 L3 26 L9 20 L15 33 L19 31 L13 18 L22 18 Z"
            fill="white"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </AbsoluteFill>
  );
};
