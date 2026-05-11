import React from "react";
import {
  AbsoluteFill,
  Video,
  useCurrentFrame,
  interpolate,
} from "remotion";
import type { RemotionScene } from "../../src/types";
import { ZoomPan }              from "./ZoomPan";
import { MotionGraphicsLayer }  from "./MotionGraphicsLayer";

interface BRollSceneProps {
  scene: RemotionScene;
}

function useTransitionStyle(
  frame: number,
  durationFrames: number,
  transitionIn: RemotionScene["transition_in"],
  transitionOut: RemotionScene["transition_out"]
): React.CSSProperties {
  const style: React.CSSProperties = {};
  const outStart = durationFrames - 10;

  // ── Transition In ──────────────────────────────────────────────────────────
  if (transitionIn === "fade") {
    style.opacity = interpolate(frame, [0, 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  if (transitionIn === "zoom_blur") {
    const scale = interpolate(frame, [0, 15], [1.2, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const blur = interpolate(frame, [0, 15], [10, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    style.transform = `${style.transform ?? ""} scale(${scale})`.trim();
    style.filter = `blur(${blur}px)`;
  }

  if (transitionIn === "glitch" && frame < 8) {
    const offsetX = ((frame * 73) % 20) - 10;
    style.transform = `${style.transform ?? ""} translateX(${offsetX}px)`.trim();
  }

  if (transitionIn === "whip_pan") {
    const tx = interpolate(frame, [0, 8], [-100, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    style.transform = `${style.transform ?? ""} translateX(${tx}%)`.trim();
  }

  // ── Transition Out ─────────────────────────────────────────────────────────
  if (transitionOut === "fade" && frame > outStart) {
    const opacity = interpolate(frame, [outStart, durationFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    // Merge with any existing opacity from transition-in
    style.opacity = style.opacity !== undefined
      ? (style.opacity as number) * opacity
      : opacity;
  }

  if (transitionOut === "zoom_blur" && frame > outStart) {
    const scale = interpolate(frame, [outStart, durationFrames], [1, 1.2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const blur = interpolate(frame, [outStart, durationFrames], [0, 10], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    style.transform = `${style.transform ?? ""} scale(${scale})`.trim();
    style.filter = (style.filter ? style.filter + " " : "") + `blur(${blur}px)`;
  }

  if (transitionOut === "glitch" && frame > durationFrames - 8) {
    const localFrame = frame - (durationFrames - 8);
    const offsetX = ((localFrame * 97) % 20) - 10;
    style.transform = `${style.transform ?? ""} translateX(${offsetX}px)`.trim();
  }

  if (transitionOut === "whip_pan" && frame > outStart) {
    const tx = interpolate(frame, [outStart, durationFrames], [0, 100], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    style.transform = `${style.transform ?? ""} translateX(${tx}%)`.trim();
  }

  return style;
}

function BRollOverlayEffect({
  type,
  frame,
  durationFrames,
}: {
  type: RemotionScene["broll_overlay"]["type"];
  frame: number;
  durationFrames: number;
}): React.ReactElement | null {
  if (type === "zoom_punch") {
    const scale = interpolate(frame, [0, durationFrames], [1, 1.12], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "center" }} />;
  }

  if (type === "color_grade_shift") {
    const mid = durationFrames / 2;
    const hue = interpolate(frame, [0, mid, durationFrames], [0, 30, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const sat = interpolate(frame, [0, mid, durationFrames], [1, 1.4, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return (
      <AbsoluteFill
        style={{ filter: `hue-rotate(${hue}deg) saturate(${sat})`, pointerEvents: "none" }}
      />
    );
  }

  if (type === "vignette_pulse") {
    const pulse = Math.sin((frame / durationFrames) * Math.PI * 2);
    const size  = interpolate(pulse, [-1, 1], [60, 80]);
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent ${size}%, rgba(0,0,0,0.75) 100%)`,
          pointerEvents: "none",
        }}
      />
    );
  }

  return null;
}

// Distinct hues per scene slot so placeholder frames are visually different
const SCENE_COLORS = [
  "#0d1b2a", "#1b0d2a", "#0d2a1b", "#2a1b0d", "#2a0d1b", "#1b2a0d",
];

export const BRollScene: React.FC<BRollSceneProps> = ({ scene }) => {
  const frame          = useCurrentFrame();
  const transitionStyle = useTransitionStyle(
    frame,
    scene.duration_frames,
    scene.transition_in,
    scene.transition_out
  );

  const sceneIndex = parseInt(scene.scene_id.replace(/\D/g, ""), 10) - 1;
  const bgColor    = SCENE_COLORS[sceneIndex % SCENE_COLORS.length];
  const clipUrl    = scene.clip_url || "";

  const zoomPanCfg = scene.motion_graphics?.zoom_pan;

  const videoElement = clipUrl ? (
    /*
     * CAUSE 3 FIX: key={scene.scene_id} forces React to unmount and remount
     *   the Video element for every scene, even when two scenes share the same
     *   src URL (e.g. in mock mode). Without this React reuses the underlying
     *   DOM <video> element and the clip never resets.
     *
     * CAUSE 4 FIX: startFrom={0} tells Remotion to seek to frame 0 of the
     *   source clip at the start of this Sequence. Without it, Remotion uses
     *   the last playback position from a previous render of the same src, so
     *   all scenes appear to loop the same clip.
     *
     *   endAt={scene.duration_frames} prevents the clip from continuing to play
     *   past the scene boundary (clip overflow into the next scene).
     */
    <Video
      key={scene.scene_id}
      src={clipUrl}
      startFrom={0}
      endAt={scene.duration_frames}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  ) : null;

  return (
    <AbsoluteFill style={{ overflow: "hidden", ...transitionStyle }}>
      {clipUrl ? (
        zoomPanCfg ? (
          <ZoomPan config={zoomPanCfg} durationFrames={scene.duration_frames}>{videoElement}</ZoomPan>
        ) : (
          videoElement
        )
      ) : (
        <AbsoluteFill
          style={{
            backgroundColor: bgColor,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.25)",
              fontFamily: "monospace",
              fontSize: 14,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            {scene.clip_source}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.6)",
              fontFamily: "sans-serif",
              fontSize: 28,
              fontWeight: 700,
              textAlign: "center",
              maxWidth: "80%",
              lineHeight: 1.3,
            }}
          >
            {scene.caption.text}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.2)",
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            {`f${frame}/${scene.duration_frames}`}
          </span>
        </AbsoluteFill>
      )}

      {scene.broll_overlay.enabled && (
        <BRollOverlayEffect
          type={scene.broll_overlay.type}
          frame={frame}
          durationFrames={scene.duration_frames}
        />
      )}

      {scene.motion_graphics && scene.motion_graphics.overlays.length > 0 && (
        <MotionGraphicsLayer config={scene.motion_graphics} />
      )}
    </AbsoluteFill>
  );
};
