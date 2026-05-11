import React from "react";
import { Composition, registerRoot } from "remotion";
import { FinalVideo }          from "./compositions/FinalVideo";
import { LogoReveal }          from "./compositions/LogoReveal";
import { CTACard }             from "./compositions/CTACard";
import { StatPopup }           from "./compositions/StatPopup";
import { KineticTypography }   from "./compositions/KineticTypography";
import { ChartAnimation }      from "./compositions/ChartAnimation";
import { UIAnimation }         from "./compositions/UIAnimation";
import { CursorDemo }          from "./compositions/CursorDemo";
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
      {/* ── Main video ──────────────────────────────────────────────────────── */}
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
            props,
          };
        }}
      />

      {/* ── Motion graphics preview compositions ───────────────────────────── */}
      <Composition
        id="PreviewLogoReveal"
        component={LogoReveal}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ config: { text: "STUDIO", tagline: "By Higgsfield AI" } }}
      />

      <Composition
        id="PreviewCTACard"
        component={CTACard}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ config: { text: "Ready to grow your brand?", ctaText: "Start Free" } }}
      />

      <Composition
        id="PreviewStatPopup"
        component={StatPopup}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ config: { value: 2400000, label: "Monthly Views", suffix: "+" } }}
      />

      <Composition
        id="PreviewKineticWordPop"
        component={KineticTypography}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ config: { text: "This Changes Everything", style: "word_pop" } }}
      />

      <Composition
        id="PreviewKineticTypewriter"
        component={KineticTypography}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ config: { text: "The future is autonomous.", style: "typewriter" } }}
      />

      <Composition
        id="PreviewChartBar"
        component={ChartAnimation}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          config: {
            type: "bar",
            title: "Revenue Growth",
            data: [
              { label: "Q1", value: 42 },
              { label: "Q2", value: 68 },
              { label: "Q3", value: 91 },
              { label: "Q4", value: 124 },
            ],
          },
        }}
      />

      <Composition
        id="PreviewUIPhone"
        component={UIAnimation}
        durationInFrames={120}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ config: { frameType: "phone", content: "const result = await generate(prompt);\n// 4K · 9:16 · 5s" } }}
      />

      <Composition
        id="PreviewCursorDemo"
        component={CursorDemo}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          config: {
            waypoints: [
              { x: 20, y: 80, frame: 0 },
              { x: 50, y: 50, frame: 30 },
              { x: 75, y: 30, frame: 60 },
            ],
            clickFrames: [35, 65],
          },
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
