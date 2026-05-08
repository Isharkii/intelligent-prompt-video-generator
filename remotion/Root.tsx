import React from "react";
import { Composition, registerRoot } from "remotion";
import { FinalVideo } from "./compositions/FinalVideo";
import sceneConfig from "./scene-config.json";
import type { RemotionScenePlan } from "../src/types";

const DIMENSIONS: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1":  { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

const config      = sceneConfig as RemotionScenePlan;
const defaultDims = DIMENSIONS[config.aspect_ratio] ?? DIMENSIONS["9:16"];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FinalVideo"
        component={FinalVideo}
        durationInFrames={config.total_duration_frames}
        fps={config.fps}
        width={defaultDims.width}
        height={defaultDims.height}
        defaultProps={{ config }}
        calculateMetadata={async ({ props }) => {
          const cfg  = (props as { config: RemotionScenePlan }).config;
          const dims = DIMENSIONS[cfg?.aspect_ratio] ?? DIMENSIONS["9:16"];
          return {
            width:            dims.width,
            height:           dims.height,
            durationInFrames: cfg?.total_duration_frames ?? config.total_duration_frames,
            fps:              cfg?.fps                   ?? config.fps,
            props:            props,
          };
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
