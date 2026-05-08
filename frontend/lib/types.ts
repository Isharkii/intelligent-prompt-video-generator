// Mirrors src/types.ts — keep in sync

export interface SessionContext {
  topic: string;
  brand?: string;
  platform?: string;
  goal?: string;
  reference?: string;
  mood?: string;
}

export interface NarrativeArc {
  beat_1_setup: string;
  beat_2_tension: string;
  beat_3_payoff: string;
}

export interface VideoScript {
  concept_id: string;
  hook_spoken: string;
  beats: Array<{
    beat: "setup" | "tension" | "payoff";
    timecode: string;
    voiceover?: string;
    on_screen_text?: string;
    visual_direction: string;
  }>;
  full_voiceover: string;
  word_count: number;
  estimated_speaking_seconds: number;
}

export interface IdeaConcept {
  id: string;
  title: string;
  hook: string;
  format: "Reel" | "TikTok" | "YouTube Short" | "LinkedIn Video";
  duration_seconds: number;
  narrative_arc: NarrativeArc;
  visual_style: string;
  target_emotion: "FOMO" | "Awe" | "Humor" | "Inspiration" | "Curiosity" | "Desire";
  shot_count: number;
  training_patterns_used: string[];
  virality_score: number;
  virality_reasoning: string;
  script?: VideoScript;
}

export interface ShotPrompt {
  shot_id: string;
  narrative_beat: "setup" | "tension" | "payoff" | "broll";
  duration_seconds: number;
  prompt: string;
  negative_prompt: string;
  aspect_ratio: "9:16" | "1:1" | "16:9";
  style_preset: "photorealistic" | "cinematic" | "stylized";
  motion_intensity: "subtle" | "moderate" | "dynamic";
}

export interface CaptionConfig {
  text: string;
  style: "bold_center" | "lower_third" | "kinetic" | "none";
  appear_at_frame: number;
  disappear_at_frame: number;
}

export interface BRollOverlay {
  enabled: boolean;
  type: "none" | "zoom_punch" | "color_grade_shift" | "vignette_pulse";
}

export interface RemotionScene {
  scene_id: string;
  from_frame: number;
  duration_frames: number;
  clip_source: string;
  clip_url?: string;
  transition_in: "cut" | "fade" | "zoom_blur" | "glitch" | "whip_pan";
  transition_out: "cut" | "fade" | "zoom_blur" | "glitch" | "whip_pan";
  caption: CaptionConfig;
  broll_overlay: BRollOverlay;
  audio_note: string;
}

export interface RemotionScenePlan {
  composition_id: string;
  fps: number;
  total_duration_frames: number;
  aspect_ratio: "9:16" | "1:1" | "16:9";
  scenes: RemotionScene[];
  global_color_grade: "warm_cinematic" | "cold_tech" | "desaturated_raw" | "vibrant_pop";
  caption_font: string;
  music_mood: "hype" | "cinematic" | "lo-fi" | "emotional" | "corporate";
}

export interface CaptionCopy {
  hook_line: string;
  body_lines: string[];
  cta: string;
  hashtags: string[];
  caption_style: "punchy" | "storytelling" | "educational" | "contrarian";
}

export interface GeneratedShot {
  shot_id: string;
  clip_url: string;
  thumbnail_url: string;
  duration_seconds: number;
  status: "success" | "failed" | "skipped";
  error?: string;
}

export interface TrainingPromptRow {
  id: string;
  source_file: "prompts list - Sheet1.csv" | "prompts list - Sheet2.csv";
  prompt: string;
  metadata: string;
  parsed_prompt: Record<string, unknown> | null;
  type: string;
  category: string;
}

export interface TrainingData {
  examples: TrainingPromptRow[];
  image_generation_examples: TrainingPromptRow[];
  fashion_examples: TrainingPromptRow[];
  cinematic_examples: TrainingPromptRow[];
}

// SSE event payloads from /api/produce
export type ProduceStage =
  | "prompts"
  | "higgsfield"
  | "lipsync"
  | "remotion";

export type ProduceStatus =
  | "running"
  | "done"
  | "warning"
  | "skipped";

export interface ProgressEvent {
  stage: ProduceStage;
  status: ProduceStatus;
  message: string;
  detail?: string;
}

export interface DoneEvent {
  videoPath: string;
  caption: CaptionCopy;
  shots: GeneratedShot[];
  concept: IdeaConcept;
}

export interface ErrorEvent {
  message: string;
}

// Brief payload from /api/write-prompts
export interface BriefPayload {
  shots: ShotPrompt[];
  scenePlan: RemotionScenePlan;
  caption: CaptionCopy;
}
