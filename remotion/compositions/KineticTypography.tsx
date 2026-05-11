import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { KineticTypographyConfig } from "../../src/types";

interface KineticTypographyProps {
  config: KineticTypographyConfig;
  durationFrames?: number;
}

// ── word_pop: each word springs in one at a time ─────────────────────────────

function WordPop({ words, frame, fps }: { words: string[]; frame: number; fps: number }) {
  const STAGGER = 6; // frames between each word
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 10px" }}>
      {words.map((word, i) => {
        const delay = i * STAGGER;
        const s = spring({ frame, fps, from: 0, to: 1, durationInFrames: 14, delay });
        const opacity = interpolate(frame - delay, [0, 6], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={`${word}_${i}`}
            style={{
              transform:     `scale(${s})`,
              opacity,
              display:       "inline-block",
              fontFamily:    "Bebas Neue, sans-serif",
              fontSize:      72,
              color:         i % 2 === 0 ? "#ffffff" : "#f59e0b",
              lineHeight:    1.1,
              textTransform: "uppercase",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

// ── typewriter: characters reveal one at a time ───────────────────────────────

function Typewriter({ text, frame }: { text: string; frame: number }) {
  const charsPerFrame = 0.8;
  const visible = Math.floor(frame * charsPerFrame);
  const displayed = text.slice(0, visible);
  const showCursor = frame % 14 < 8;
  return (
    <span
      style={{
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 700,
        fontSize:   48,
        color:      "#ffffff",
        letterSpacing: 1,
      }}
    >
      {displayed}
      {showCursor && (
        <span style={{ color: "#f59e0b", marginLeft: 2 }}>|</span>
      )}
    </span>
  );
}

// ── slide_up: full text slides up from below ──────────────────────────────────

function SlideUp({ text, frame, fps }: { text: string; frame: number; fps: number }) {
  const y = spring({ frame, fps, from: 60, to: 0, durationInFrames: 18, config: { damping: 14 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ overflow: "hidden", padding: "4px 0" }}>
      <span
        style={{
          display:       "block",
          transform:     `translateY(${y}px)`,
          opacity,
          fontFamily:    "Montserrat, sans-serif",
          fontWeight:    800,
          fontSize:      60,
          color:         "#ffffff",
          textAlign:     "center",
          textTransform: "uppercase",
          letterSpacing: 4,
        }}
      >
        {text}
      </span>
    </div>
  );
}

// ── split: text splits apart then snaps together ─────────────────────────────

function Split({ text, frame, fps }: { text: string; frame: number; fps: number }) {
  const words = text.split(" ");
  const mid   = Math.floor(words.length / 2);
  const top   = words.slice(0, mid).join(" ");
  const bot   = words.slice(mid).join(" ");

  const topY = spring({ frame, fps, from: -50, to: 0, durationInFrames: 20, config: { damping: 10 } });
  const botY = spring({ frame, fps, from: 50,  to: 0, durationInFrames: 20, config: { damping: 10 } });
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textStyle: React.CSSProperties = {
    fontFamily:    "Montserrat, sans-serif",
    fontWeight:    800,
    fontSize:      64,
    color:         "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 3,
    opacity,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ ...textStyle, transform: `translateY(${topY}px)` }}>{top}</span>
      <span style={{ ...textStyle, transform: `translateY(${botY}px)`, color: "#f59e0b" }}>{bot}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const KineticTypography: React.FC<KineticTypographyProps> = ({ config, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const d = durationFrames ?? durationInFrames;

  const fadeOut = interpolate(frame, [d - 10, d], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const words = config.text.split(" ");

  return (
    <AbsoluteFill
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "0 48px",
        opacity:        fadeOut,
        pointerEvents:  "none",
      }}
    >
      {config.style === "word_pop"  && <WordPop  words={words} frame={frame} fps={fps} />}
      {config.style === "typewriter" && <Typewriter text={config.text} frame={frame} />}
      {config.style === "slide_up"  && <SlideUp  text={config.text}  frame={frame} fps={fps} />}
      {config.style === "split"     && <Split    text={config.text}  frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};
