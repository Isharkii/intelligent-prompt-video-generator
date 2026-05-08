export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const PLATFORMS = [
  "Instagram",
  "TikTok",
  "YouTube Shorts",
  "LinkedIn",
] as const;

export const GOALS = [
  "Awareness",
  "Sales",
  "Engagement",
  "Education",
] as const;

export const MOODS = [
  "calm",
  "hype",
  "cinematic",
  "raw",
  "luxury",
] as const;

export const EMOTION_COLORS: Record<string, string> = {
  FOMO:        "text-red-400",
  Awe:         "text-purple-400",
  Humor:       "text-yellow-400",
  Inspiration: "text-blue-400",
  Curiosity:   "text-teal-400",
  Desire:      "text-pink-400",
};

export const STAGE_LABELS: Record<string, string> = {
  prompts:     "Writing shot prompts",
  higgsfield:  "Generating video clips",
  lipsync:     "Applying lipsync",
  remotion:    "Rendering final video",
};

export const PRODUCE_STAGES = ["prompts", "higgsfield", "lipsync", "remotion"] as const;

export const INSPIRATION_TICKERS = [
  "AI-generated video clips via Higgsfield",
  "Animated captions via Remotion",
  "Shot prompts trained on your CSV library",
  "Dark cinematic · warm_cinematic grade",
  "ElevenLabs lipsync integration",
  "SSE-streamed production progress",
  "9:16 · 1:1 · 16:9 export formats",
  "Fully autonomous creative direction",
  "Claude Sonnet 4 powers every decision",
  "Zero stock footage · 100% generated",
];
