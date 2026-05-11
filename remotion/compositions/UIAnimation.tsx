import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { UIAnimationConfig } from "../../src/types";

interface UIAnimationProps {
  config: UIAnimationConfig;
  durationFrames?: number;
}

export const UIAnimation: React.FC<UIAnimationProps> = ({ config, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const d = durationFrames ?? durationInFrames;

  const scaleIn = spring({ frame, fps, from: 0.88, to: 1, durationInFrames: 20 });
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [d - 10, d], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Typewriter for content text
  const charsVisible = Math.floor(interpolate(frame, [18, 18 + config.content.length * 1.2], [0, config.content.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  const displayedContent = config.content.slice(0, charsVisible);
  const showCursor = frame > 16 && frame % 12 < 7;

  const isPhone = config.frameType === "phone";

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
          transform: `scale(${scaleIn})`,
          opacity:   opacity * fadeOut,
          ...(isPhone ? phoneFrameStyle : browserFrameStyle),
        }}
      >
        {isPhone ? (
          <PhoneContent content={displayedContent} showCursor={showCursor} />
        ) : (
          <BrowserContent content={displayedContent} showCursor={showCursor} />
        )}
      </div>
    </AbsoluteFill>
  );
};

const phoneFrameStyle: React.CSSProperties = {
  width:           260,
  height:          500,
  borderRadius:    36,
  background:      "#1a1a1a",
  border:          "3px solid rgba(255,255,255,0.18)",
  boxShadow:       "0 20px 60px rgba(0,0,0,0.6)",
  overflow:        "hidden",
  display:         "flex",
  flexDirection:   "column",
};

const browserFrameStyle: React.CSSProperties = {
  width:           440,
  borderRadius:    12,
  background:      "#1e1e1e",
  border:          "2px solid rgba(255,255,255,0.12)",
  boxShadow:       "0 20px 60px rgba(0,0,0,0.6)",
  overflow:        "hidden",
};

function PhoneContent({ content, showCursor }: { content: string; showCursor: boolean }) {
  return (
    <>
      {/* Status bar */}
      <div style={{
        height:          28,
        background:      "#111",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        paddingTop:      6,
      }}>
        <div style={{ width: 60, height: 6, background: "#333", borderRadius: 4 }} />
      </div>
      {/* Screen */}
      <div style={{
        flex:       1,
        background: "#0d0d0d",
        padding:    16,
        display:    "flex",
        flexDirection: "column",
        gap:        10,
      }}>
        <div style={{ height: 8, width: "70%", background: "#2a2a2a", borderRadius: 4 }} />
        <div style={{ height: 8, width: "50%", background: "#2a2a2a", borderRadius: 4 }} />
        <div style={{
          marginTop:  8,
          background: "#161616",
          borderRadius: 8,
          padding:    12,
          flex:       1,
          border:     "1px solid #2a2a2a",
        }}>
          <span style={{
            fontFamily: "monospace",
            fontSize:   13,
            color:      "#e2e8f0",
            whiteSpace: "pre-wrap",
            lineHeight: 1.6,
          }}>
            {content}
            {showCursor && <span style={{ color: "#f59e0b" }}>|</span>}
          </span>
        </div>
      </div>
      {/* Home bar */}
      <div style={{
        height:         28,
        background:     "#111",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}>
        <div style={{ width: 80, height: 4, background: "#333", borderRadius: 4 }} />
      </div>
    </>
  );
}

function BrowserContent({ content, showCursor }: { content: string; showCursor: boolean }) {
  return (
    <>
      {/* Browser chrome */}
      <div style={{
        height:         38,
        background:     "#2a2a2a",
        display:        "flex",
        alignItems:     "center",
        padding:        "0 12px",
        gap:            6,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
        <div style={{
          flex:         1,
          marginLeft:   8,
          height:       22,
          background:   "#1a1a1a",
          borderRadius: 4,
          display:      "flex",
          alignItems:   "center",
          padding:      "0 8px",
        }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
            studio.app
          </span>
        </div>
      </div>
      {/* Page content */}
      <div style={{
        background: "#0f0f0f",
        padding:    20,
        minHeight:  200,
      }}>
        <span style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize:   15,
          color:      "#e2e8f0",
          whiteSpace: "pre-wrap",
          lineHeight: 1.7,
        }}>
          {content}
          {showCursor && <span style={{ color: "#f59e0b" }}>|</span>}
        </span>
      </div>
    </>
  );
}
