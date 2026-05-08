import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type { GeneratedShot } from "../types";

const OUTPUT_DIR = path.resolve(process.env.REMOTION_OUTPUT_DIR ?? "./output");

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function downloadClip(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("curl", ["-sL", "--max-time", "60", "-o", destPath, url]);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`curl failed (exit ${code}) for ${url}`));
    });
    proc.on("error", reject);
  });
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const proc = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    proc.stderr?.on("data", (c: Buffer) => { stderr += c.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (exit ${code}): ${stderr.slice(-400)}`));
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("ffmpeg not found. Install with: brew install ffmpeg"));
      } else reject(err);
    });
  });
}

/**
 * Concatenates all successful Higgsfield clips into a single MP4.
 * If voiceoverPath and/or musicPath are provided, mixes audio:
 *   - voiceover only  → 100% volume
 *   - music only      → 30% volume, fade-out last 3 seconds
 *   - both            → voiceover 100%, music ducked to 20%
 *   - neither         → no audio track
 *
 * Returns the output file path and a human-readable audio description.
 */
export async function renderHiggsFieldOnly(
  shots: GeneratedShot[],
  timestamp: string,
  voiceoverPath?: string,
  musicPath?: string
): Promise<{ outputPath: string; audioDesc: string }> {
  ensureOutputDir();

  const successful = shots.filter((s) => s.status === "success" && s.clip_url);
  if (successful.length === 0) throw new Error("No successful Higgsfield shots to concatenate.");

  const tmpDir = path.join(OUTPUT_DIR, `tmp_${timestamp}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let outputPath = "";
  let audioDesc  = "none";

  try {
    console.log(`\n📥 Downloading ${successful.length} Higgsfield clips...`);

    const localPaths = await Promise.all(
      successful.map(async (shot, i) => {
        const dest = path.join(tmpDir, `clip_${String(i + 1).padStart(2, "0")}.mp4`);
        console.log(`  ⬇  ${shot.shot_id} → ${dest}`);
        await downloadClip(shot.clip_url, dest);
        return dest;
      })
    );

    const concatList  = path.join(tmpDir, "concat.txt");
    const listContent = localPaths.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(concatList, listContent);

    outputPath        = path.join(OUTPUT_DIR, `higgsfield_only_${timestamp}.mp4`);
    const concatVideo = path.join(tmpDir, "video_only.mp4");

    console.log("\n🔗 Concatenating clips with FFmpeg...");

    // Step 1: plain concat (video only)
    await ffmpeg([
      "-f", "concat", "-safe", "0", "-i", concatList,
      "-c:v", "libx264", "-crf", "23", "-preset", "fast",
      "-an",
      "-movflags", "+faststart",
      concatVideo,
    ]);

    const hasVoice = Boolean(voiceoverPath && fs.existsSync(voiceoverPath));
    const hasMusic = Boolean(musicPath    && fs.existsSync(musicPath));

    // Compute total duration for correct music fade-out timing
    const totalDurationSeconds = successful.reduce((sum, s) => sum + s.duration_seconds, 0);
    const fadeSt = Math.max(0, totalDurationSeconds - 3);

    if (hasVoice && hasMusic) {
      audioDesc = `Voiceover (${path.basename(voiceoverPath!)}) + ${path.basename(musicPath!)} at 20%`;
      await ffmpeg([
        "-i", concatVideo,
        "-i", voiceoverPath!,
        "-i", musicPath!,
        "-filter_complex",
        `[1:a]volume=1.0[voice]; [2:a]volume=0.2,afade=t=out:st=${fadeSt}:d=3[music]; [voice][music]amix=inputs=2:duration=first[a]`,
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-shortest",
        "-movflags", "+faststart",
        outputPath,
      ]);
    } else if (hasVoice) {
      audioDesc = `Voiceover only (${path.basename(voiceoverPath!)})`;
      await ffmpeg([
        "-i", concatVideo,
        "-i", voiceoverPath!,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-shortest",
        "-movflags", "+faststart",
        outputPath,
      ]);
    } else if (hasMusic) {
      audioDesc = `${path.basename(musicPath!)} at 30%`;
      await ffmpeg([
        "-i", concatVideo,
        "-i", musicPath!,
        "-filter_complex",
        `[1:a]volume=0.3,afade=t=out:st=${fadeSt}:d=3[a]`,
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-shortest",
        "-movflags", "+faststart",
        outputPath,
      ]);
    } else {
      audioDesc = "none (add music files to assets/music/)";
      fs.copyFileSync(concatVideo, outputPath);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`✓ Higgsfield-only render → ${outputPath}`);
  return { outputPath, audioDesc };
}
