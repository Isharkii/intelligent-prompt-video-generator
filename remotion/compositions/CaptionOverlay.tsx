import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadDMSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import type { CaptionConfig } from "../../src/types";

// Load only the weights we use — reduces network requests during render
const { fontFamily: montserrat } = loadMontserrat("normal", { weights: ["800"] });
const { fontFamily: dmSans }     = loadDMSans("normal",     { weights: ["700"] });
const { fontFamily: bebasNeue }  = loadBebasNeue("normal",  { weights: ["400"] });

const AMBER = "#F5A623";

interface CaptionOverlayProps {
  caption: CaptionConfig;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeRange(
  appearAt: number,
  disappearAt: number
): [number, number, number, number] {
  const fadeInEnd    = appearAt + 8;
  const fadeOutStart = Math.max(fadeInEnd + 1, disappearAt - 6);
  return [appearAt, fadeInEnd, fadeOutStart, Math.max(fadeOutStart + 1, disappearAt)];
}

// Gradient scrim — shared by bold_center and kinetic so text is always readable
function Scrim({ height }: { height: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: height * 0.25,
        height: height * 0.35,
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 100%)",
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Bold Center ──────────────────────────────────────────────────────────────
// Safe zone: top = 60% of height, centered, uppercase, max 2 lines

const BoldCenter: React.FC<{
  text: string;
  frame: number;
  appearAt: number;
  disappearAt: number;
}> = ({ text, frame, appearAt, disappearAt }) => {
  const { width, height } = useVideoConfig();

  const opacity = interpolate(
    frame,
    safeRange(appearAt, disappearAt),
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const fontSize     = Math.round(width * 0.072);
  const topPosition  = height * 0.60;
  const hMargin      = width * 0.08;

  return (
    <AbsoluteFill style={{ opacity }}>
      <Scrim height={height} />
      <div
        style={{
          position: "absolute",
          top: topPosition,
          left: hMargin,
          right: hMargin,
          zIndex: 2,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily: montserrat,
            fontWeight: 800,
            fontSize,
            color: "#FFFFFF",
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            textShadow:
              "0 2px 4px rgba(0,0,0,0.9), 0 4px 16px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)",
            display: "block",
            wordSpacing: "0.08em",
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ─── Lower Third ──────────────────────────────────────────────────────────────
// Safe zone: top = 68% of height, left-aligned, amber bar, dark pill bg

const LowerThird: React.FC<{
  text: string;
  frame: number;
  appearAt: number;
  disappearAt: number;
}> = ({ text, frame, appearAt, disappearAt }) => {
  const { width, height } = useVideoConfig();

  const [r0, r1, r2, r3] = safeRange(appearAt, disappearAt);
  const slideY = interpolate(frame, [r0, r1, r2, r3], [30, 0, 0, 30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [r0, r1, r2, r3], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fontSize    = Math.round(width * 0.052);
  const topPosition = height * 0.68;

  return (
    <AbsoluteFill
      style={{ opacity, transform: `translateY(${slideY}px)` }}
    >
      <div
        style={{
          position: "absolute",
          top: topPosition,
          left: width * 0.06,
          right: width * 0.10,
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.72)",
            borderLeft: `4px solid ${AMBER}`,
            padding: "10px 20px",
            borderRadius: 4,
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontFamily: dmSans,
              fontWeight: 700,
              fontSize,
              color: "#FFFFFF",
              lineHeight: 1.25,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {text}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Kinetic ──────────────────────────────────────────────────────────────────
// Safe zone: top = 55% of height, word-by-word spring pop, alternating white/amber

const Kinetic: React.FC<{
  text: string;
  frame: number;
  appearAt: number;
  disappearAt: number;
}> = ({ text, frame, appearAt, disappearAt }) => {
  const { width, height } = useVideoConfig();
  const words = text.split(" ");

  const containerOpacity = interpolate(
    frame,
    [disappearAt - 6, disappearAt],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const fontSize    = Math.round(width * 0.115);
  const topPosition = height * 0.55;

  return (
    <AbsoluteFill style={{ opacity: containerOpacity }}>
      <Scrim height={height} />
      <div
        style={{
          position: "absolute",
          top: topPosition,
          left: width * 0.05,
          right: width * 0.05,
          zIndex: 2,
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35em",
          rowGap: "0.25em",
          justifyContent: "center",
        }}
      >
        {words.map((word, i) => {
          const wordStart  = appearAt + i * 3;
          const localFrame = frame - wordStart;

          const scale = interpolate(localFrame, [0, 3, 5], [0.6, 1.1, 1.0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const wordOpacity = interpolate(localFrame, [0, 2], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const wordColor = i % 2 === 0 ? "#FFFFFF" : AMBER;

          return (
            <span
              key={i}
              style={{
                fontFamily: bebasNeue,
                fontWeight: 400,
                fontSize,
                color: wordColor,
                letterSpacing: "0.04em",
                lineHeight: 1.0,
                display: "inline-block",
                textShadow: "0 4px 20px rgba(0,0,0,0.8)",
                opacity: wordOpacity,
                transform: `scale(${scale})`,
                transformOrigin: "center bottom",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DEBUG = process.env.DEBUG_CAPTIONS === "true";

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ caption }) => {
  const frame = useCurrentFrame();
  useVideoConfig();

  if (!caption) return null;
  const { text, style, appear_at_frame, disappear_at_frame } = caption;

  if (!text || text.trim() === "") return null;
  if (style === "none") return null;
  if (frame < appear_at_frame || frame > disappear_at_frame) return null;

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(
      `[CaptionOverlay] frame=${frame} style=${style} appear=${appear_at_frame} disappear=${disappear_at_frame} text="${text.slice(0, 40)}"`
    );
  }

  if (style === "bold_center") {
    return (
      <BoldCenter
        text={text}
        frame={frame}
        appearAt={appear_at_frame}
        disappearAt={disappear_at_frame}
      />
    );
  }

  if (style === "lower_third") {
    return (
      <LowerThird
        text={text}
        frame={frame}
        appearAt={appear_at_frame}
        disappearAt={disappear_at_frame}
      />
    );
  }

  if (style === "kinetic") {
    return (
      <Kinetic
        text={text}
        frame={frame}
        appearAt={appear_at_frame}
        disappearAt={disappear_at_frame}
      />
    );
  }

  return null;
};
