"use client";

import { create } from "zustand";
import type {
  SessionContext,
  IdeaConcept,
  ShotPrompt,
  RemotionScenePlan,
  CaptionCopy,
  GeneratedShot,
  ProgressEvent,
  ProduceStage,
} from "./types";

export type AppStage =
  | "input"
  | "ideas"
  | "brief"
  | "producing"
  | "delivery"
  | "training";

export interface ShotStatus {
  shot_id: string;
  status: "pending" | "generating" | "success" | "failed" | "skipped";
  clip_url?: string;
}

export interface StageProgress {
  status: "idle" | "running" | "done" | "warning" | "skipped";
  message: string;
}

interface StudioStore {
  // Stage
  stage: AppStage;
  setStage: (stage: AppStage) => void;

  // Session context (from input form)
  context: SessionContext | null;
  setContext: (ctx: SessionContext) => void;

  // Ideas
  ideas: IdeaConcept[];
  setIdeas: (ideas: IdeaConcept[]) => void;
  selectedIndex: number;
  selectIdea: (index: number) => void;

  // Brief
  shots: ShotPrompt[];
  scenePlan: RemotionScenePlan | null;
  caption: CaptionCopy | null;
  setBrief: (brief: { shots: ShotPrompt[]; scenePlan: RemotionScenePlan; caption: CaptionCopy }) => void;

  // Producing — SSE progress
  stageProgress: Record<ProduceStage, StageProgress>;
  shotStatuses: ShotStatus[];
  logLines: string[];
  currentFrame: number;
  totalFrames: number;
  updateProgress: (evt: ProgressEvent) => void;
  setFrame: (current: number, total: number) => void;
  appendLog: (line: string) => void;

  // Delivery
  videoPath: string;
  deliveredShots: GeneratedShot[];
  deliveredConcept: IdeaConcept | null;
  deliveredCaption: CaptionCopy | null;
  setDelivery: (payload: {
    videoPath: string;
    shots: GeneratedShot[];
    concept: IdeaConcept;
    caption: CaptionCopy;
  }) => void;

  // Error
  error: string | null;
  setError: (err: string | null) => void;

  // Reset
  reset: () => void;
}

const defaultStageProgress = (): Record<ProduceStage, StageProgress> => ({
  prompts:    { status: "idle", message: "" },
  higgsfield: { status: "idle", message: "" },
  lipsync:    { status: "idle", message: "" },
  remotion:   { status: "idle", message: "" },
});

export const useStudio = create<StudioStore>((set, get) => ({
  stage: "input",
  setStage: (stage) => set({ stage }),

  context: null,
  setContext: (ctx) => set({ context: ctx }),

  ideas: [],
  setIdeas: (ideas) => set({ ideas }),
  selectedIndex: 0,
  selectIdea: (index) => set({ selectedIndex: index }),

  shots: [],
  scenePlan: null,
  caption: null,
  setBrief: ({ shots, scenePlan, caption }) =>
    set({ shots, scenePlan, caption }),

  stageProgress: defaultStageProgress(),
  shotStatuses: [],
  logLines: [],
  currentFrame: 0,
  totalFrames: 0,

  updateProgress: (evt) => {
    const prev = get().stageProgress;
    set({
      stageProgress: {
        ...prev,
        [evt.stage]: { status: evt.status, message: evt.message },
      },
    });
    // Append SSE message to log
    const statusIcon: Record<string, string> = {
      running: "⏳",
      done:    "✓",
      warning: "⚠",
      skipped: "—",
    };
    const icon = statusIcon[evt.status] ?? "·";
    set((s) => ({
      logLines: [...s.logLines, `${icon} [${evt.stage}] ${evt.message}`],
    }));
  },

  setFrame: (current, total) =>
    set({ currentFrame: current, totalFrames: total }),

  appendLog: (line) =>
    set((s) => ({ logLines: [...s.logLines, line] })),

  videoPath: "",
  deliveredShots: [],
  deliveredConcept: null,
  deliveredCaption: null,
  setDelivery: ({ videoPath, shots, concept, caption }) =>
    set({
      videoPath,
      deliveredShots: shots,
      deliveredConcept: concept,
      deliveredCaption: caption,
    }),

  error: null,
  setError: (err) => set({ error: err }),

  reset: () =>
    set({
      stage: "input",
      context: null,
      ideas: [],
      selectedIndex: 0,
      shots: [],
      scenePlan: null,
      caption: null,
      stageProgress: defaultStageProgress(),
      shotStatuses: [],
      logLines: [],
      currentFrame: 0,
      totalFrames: 0,
      videoPath: "",
      deliveredShots: [],
      deliveredConcept: null,
      deliveredCaption: null,
      error: null,
    }),
}));
