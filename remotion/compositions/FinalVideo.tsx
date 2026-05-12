import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { RemotionScenePlan } from "../../src/types";
import { CaptionOverlay } from "./CaptionOverlay";
import { BRollScene } from "./BRollScene";

const COLOR_GRADES: Record<string, string> = {
  warm_cinematic: "sepia(0.2) saturate(1.3) brightness(1.05) contrast(1.1)",
  cold_tech: "hue-rotate(200deg) saturate(0.8) brightness(0.95) contrast(1.15)",
  desaturated_raw: "saturate(0.5) contrast(1.2) brightness(1.0)",
  vibrant_pop: "saturate(1.6) brightness(1.1) contrast(1.05)",
};

interface FinalVideoProps {
  config: RemotionScenePlan;
}

export const FinalVideo: React.FC<FinalVideoProps> = ({ config }) => {
  const gradeFilter = COLOR_GRADES[config.global_color_grade] ?? COLOR_GRADES.warm_cinematic;

  return (
    <AbsoluteFill
      style={{ backgroundColor: "#000000", filter: gradeFilter }}
    >
      {config.scenes.map((scene) => {
        const from            = Math.round(scene.from_frame);
        const durationInFrames = Math.round(scene.duration_frames);
        // eslint-disable-next-line no-console
        console.log(
          `[FinalVideo] ${scene.scene_id} from=${from} dur=${durationInFrames} clip=${scene.clip_url ?? "(placeholder)"}`
        );
        return (
          <Sequence
            key={scene.scene_id}
            from={from}
            durationInFrames={durationInFrames}
          >
            <BRollScene scene={scene} />
            {/* Suppress CaptionOverlay when motion_graphics already has a subtitle overlay
                to prevent double text rendering (SubtitleTrack bottom + CaptionOverlay middle) */}
            {!scene.motion_graphics?.overlays?.some((o) => o.type === "subtitle") && (
              <CaptionOverlay caption={scene.caption} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
