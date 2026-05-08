import fs from "fs";
import path from "path";

const MUSIC_DIR = path.resolve(process.cwd(), "assets", "music");
const EXTENSIONS = [".mp3", ".wav", ".m4a"];

const MOOD_TO_STEM: Record<string, string> = {
  hype:      "hype",
  cinematic: "cinematic",
  "lo-fi":   "lofi",
  lofi:      "lofi",
  emotional: "emotional",
  corporate: "corporate",
};

/**
 * Returns the absolute path to the music file for `mood`, or null if:
 * - The mood has no mapping
 * - No file with a supported extension (.mp3, .wav, .m4a) exists on disk
 */
export function selectTrack(mood: string): string | null {
  const stem = MOOD_TO_STEM[mood.toLowerCase().trim()];
  if (!stem) {
    console.warn(`⚠  No music file mapped for mood "${mood}" — skipping audio`);
    return null;
  }

  for (const ext of EXTENSIONS) {
    const fullPath = path.join(MUSIC_DIR, `${stem}${ext}`);
    if (fs.existsSync(fullPath)) {
      console.log(`✓ Music track selected: ${stem}${ext}`);
      return fullPath;
    }
  }

  console.warn(`⚠  No music file for mood "${mood}" — skipping audio (add ${stem}.mp3 to assets/music/)`);
  return null;
}
