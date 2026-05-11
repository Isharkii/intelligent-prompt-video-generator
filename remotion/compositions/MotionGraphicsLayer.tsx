import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { MotionGraphicOverlay, MotionGraphicsConfig } from "../../src/types";
import { ParticleOverlay }    from "./ParticleOverlay";
import { LogoReveal }         from "./LogoReveal";
import { CTACard }            from "./CTACard";
import { StatPopup }          from "./StatPopup";
import { SubtitleTrack }      from "./SubtitleTrack";
import { KineticTypography }  from "./KineticTypography";
import { UIAnimation }        from "./UIAnimation";
import { CursorDemo }         from "./CursorDemo";
import { ChartAnimation }     from "./ChartAnimation";

interface MotionGraphicsLayerProps {
  config: MotionGraphicsConfig;
}

// durationFrames is the Sequence duration — must be passed so each overlay's fade-out
// uses its own local duration instead of useVideoConfig().durationInFrames (full composition).
function OverlayContent({ overlay, durationFrames }: { overlay: MotionGraphicOverlay; durationFrames: number }) {
  switch (overlay.type) {
    case "particle":
      return <ParticleOverlay config={overlay.config} durationFrames={durationFrames} />;
    case "logo_reveal":
      return <LogoReveal config={overlay.config} durationFrames={durationFrames} />;
    case "cta_card":
      return <CTACard config={overlay.config} durationFrames={durationFrames} />;
    case "stat_popup":
      return <StatPopup config={overlay.config} durationFrames={durationFrames} />;
    case "subtitle":
      return <SubtitleTrack config={overlay.config} />;
    case "kinetic_type":
      return <KineticTypography config={overlay.config} durationFrames={durationFrames} />;
    case "ui_anim":
      return <UIAnimation config={overlay.config} durationFrames={durationFrames} />;
    case "cursor":
      return <CursorDemo config={overlay.config} durationFrames={durationFrames} />;
    case "chart":
      return <ChartAnimation config={overlay.config} durationFrames={durationFrames} />;
    default:
      return null;
  }
}

export const MotionGraphicsLayer: React.FC<MotionGraphicsLayerProps> = ({ config }) => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {config.overlays.map((overlay, i) => {
        const duration = overlay.disappear_at_frame - overlay.appear_at_frame;
        if (duration <= 0) return null;
        return (
          <Sequence
            key={`${overlay.type}_${overlay.appear_at_frame}_${i}`}
            from={overlay.appear_at_frame}
            durationInFrames={duration}
            layout="none"
          >
            <AbsoluteFill>
              <OverlayContent overlay={overlay} durationFrames={duration} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
