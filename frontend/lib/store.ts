"use client";

import { create } from "zustand";
import type {
  SessionContext,
  IdeaConcept,
  ShotPrompt,
  RemotionScenePlan,
  CaptionCopy,
  GeneratedShot,
} from "./types";

export type AppStage =
  | "input"
  | "ideas"
  | "producing"
  | "delivery"
  | "training";

interface StudioStore {
  // Stage
  stage: AppStage;
  setStage: (stage: AppStage) => void;

  // Session context
  context: SessionContext | null;
  setContext: (ctx: SessionContext) => void;

  // Ideas
  ideas: IdeaConcept[];
  setIdeas: (ideas: IdeaConcept[]) => void;
  selectedIndex: number;
  selectIdea: (index: number) => void;

  // Produce target — concept the user chose to produce
  produceTarget: IdeaConcept | null;
  setProduceTarget: (concept: IdeaConcept) => void;

  // Brief (kept for write-prompts compatibility, not in main flow)
  shots: ShotPrompt[];
  scenePlan: RemotionScenePlan | null;
  caption: CaptionCopy | null;
  setBrief: (brief: { shots: ShotPrompt[]; scenePlan: RemotionScenePlan; caption: CaptionCopy }) => void;

  // Claude live stream
  claudeText: string;
  appendClaudeText: (chunk: string) => void;
  toolCalls: Array<{ name: string; done: boolean }>;
  pushToolCall: (name: string) => void;
  completeToolCall: (name: string) => void;
  produceStatus: string;
  setProduceStatus: (msg: string) => void;

  // Delivery
  videoPath: string;
  deliveredShots: GeneratedShot[];
  deliveredConcept: IdeaConcept | null;
  deliveredCaption: CaptionCopy | null;
  deliveredVoiceover: { hook_line: string; body_script: string; outro_line: string } | null;
  setDelivery: (payload: {
    videoPath: string;
    shots: GeneratedShot[];
    concept: IdeaConcept;
    caption: CaptionCopy | null;
    voiceover?: { hook_line: string; body_script: string; outro_line: string } | null;
  }) => void;

  // Error
  error: string | null;
  setError: (err: string | null) => void;

  // Reset
  reset: () => void;
}

export const useStudio = create<StudioStore>((set) => ({
  stage: "input",
  setStage: (stage) => set({ stage }),

  context: null,
  setContext: (ctx) => set({ context: ctx }),

  ideas: [],
  setIdeas: (ideas) => set({ ideas }),
  selectedIndex: 0,
  selectIdea: (index) => set({ selectedIndex: index }),

  produceTarget: null,
  setProduceTarget: (concept) => set({ produceTarget: concept }),

  shots: [],
  scenePlan: null,
  caption: null,
  setBrief: ({ shots, scenePlan, caption }) => set({ shots, scenePlan, caption }),

  claudeText: "",
  appendClaudeText: (chunk) => set((s) => ({ claudeText: s.claudeText + chunk })),
  toolCalls: [],
  pushToolCall: (name) =>
    set((s) => ({ toolCalls: [...s.toolCalls, { name, done: false }] })),
  completeToolCall: (name) =>
    set((s) => ({
      toolCalls: s.toolCalls.map((t) =>
        t.name === name && !t.done ? { ...t, done: true } : t
      ),
    })),
  produceStatus: "",
  setProduceStatus: (msg) => set({ produceStatus: msg }),

  videoPath: "",
  deliveredShots: [],
  deliveredConcept: null,
  deliveredCaption: null,
  deliveredVoiceover: null,
  setDelivery: ({ videoPath, shots, concept, caption, voiceover }) =>
    set({
      videoPath,
      deliveredShots:     shots,
      deliveredConcept:   concept,
      deliveredCaption:   caption,
      deliveredVoiceover: voiceover ?? null,
    }),

  error: null,
  setError: (err) => set({ error: err }),

  reset: () =>
    set({
      stage:           "input",
      context:         null,
      ideas:           [],
      selectedIndex:   0,
      produceTarget:   null,
      shots:           [],
      scenePlan:       null,
      caption:         null,
      claudeText:      "",
      toolCalls:       [],
      produceStatus:   "",
      videoPath:       "",
      deliveredShots:     [],
      deliveredConcept:   null,
      deliveredCaption:   null,
      deliveredVoiceover: null,
      error:           null,
    }),

  // Legacy — kept so existing code compiles
  stageProgress: {} as never,
  shotStatuses: [] as never,
  logLines: [] as never,
  currentFrame: 0,
  totalFrames: 0,
  updateProgress: () => { /* no-op */ },
  setFrame: () => { /* no-op */ },
  appendLog: () => { /* no-op */ },
}));
