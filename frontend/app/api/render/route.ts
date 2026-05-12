/**
 * POST /api/render
 *
 * Builds a RemotionScenePlan from the generated shots, writes it as CLI props,
 * and invokes `npx remotion render` to produce the final MP4 with all captions,
 * transitions, zoom-pan, and motion graphics baked in via the Remotion compositions.
 *
 * Body:   { shots: GeneratedShot[], voiceover?, caption? }
 * Returns: MP4 stream (binary)
 */

import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import type { GeneratedShot, CaptionCopy, RemotionScenePlan, RemotionScene } from "@/lib/types";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface VoiceoverScript {
  shot_01?: string;
  shot_02?: string;
  shot_03?: string;
}

function getTransitionIn(i: number): RemotionScene["transition_in"] {
  if (i === 0) return "fade";
  const seq: RemotionScene["transition_in"][] = ["cut", "zoom_blur", "cut", "whip_pan"];
  return seq[(i - 1) % seq.length];
}

function getTransitionOut(i: number, total: number): RemotionScene["transition_out"] {
  return i === total - 1 ? "fade" : "cut";
}

function buildScenePlan(
  shots: GeneratedShot[],
  voiceover: VoiceoverScript | null,
  caption: CaptionCopy | null,
): RemotionScenePlan {
  const fps = 30;
  let fromFrame = 0;

  const scenes: RemotionScene[] = shots.map((shot, i) => {
    const durationFrames = Math.round((shot.duration_seconds || 5) * fps);
    const shotKey = `shot_0${i + 1}` as keyof VoiceoverScript;
    const voText = voiceover?.[shotKey] ?? "";
    const captionText = voText || (i === 0 && caption?.hook_line ? caption.hook_line : "");

    const scene: RemotionScene = {
      scene_id: `scene_0${i + 1}`,
      from_frame: fromFrame,
      duration_frames: durationFrames,
      clip_source: shot.shot_id,
      clip_url: shot.clip_url || undefined,
      transition_in: getTransitionIn(i),
      transition_out: getTransitionOut(i, shots.length),
      caption: {
        text: captionText,
        style: captionText ? (i === 0 ? "bold_center" : "lower_third") : "none",
        appear_at_frame: 10,
        disappear_at_frame: durationFrames - 10,
      },
      broll_overlay: {
        enabled: i === shots.length - 1,
        type: i === shots.length - 1 ? "vignette_pulse" : "none",
      },
      audio_note: i === 0 ? "fade in" : i === shots.length - 1 ? "fade out" : "continue",
      motion_graphics: shot.motion_graphics,
    };

    fromFrame += durationFrames;
    return scene;
  });

  return {
    composition_id: "FinalVideo",
    fps,
    total_duration_frames: fromFrame,
    aspect_ratio: "9:16",
    scenes,
    global_color_grade: "warm_cinematic",
    caption_font: "Inter",
    music_mood: "cinematic",
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    shots: GeneratedShot[];
    voiceover?: VoiceoverScript;
    caption?: CaptionCopy;
  };
  const { shots, voiceover = null, caption = null } = body;

  const validShots = (shots ?? []).filter((s) => s.status === "success" && s.clip_url);
  if (validShots.length === 0) {
    return NextResponse.json({ error: "No valid shots to render" }, { status: 400 });
  }

  // The Next.js dev server runs from frontend/; go up one level to the project root
  const projectRoot = path.resolve(process.cwd(), "..");
  const remotionEntry = path.join(projectRoot, "remotion", "Root.tsx");
  if (!fs.existsSync(remotionEntry)) {
    return NextResponse.json(
      { error: `Remotion project not found at ${remotionEntry}` },
      { status: 500 }
    );
  }

  const outputDir  = path.join(projectRoot, "output");
  const ts         = Date.now();
  const outputFile = path.join(outputDir, `reel_${ts}.mp4`);
  const propsFile  = path.join(outputDir, `props_${ts}.json`);

  try {
    const scenePlan = buildScenePlan(validShots, voiceover, caption);

    fs.mkdirSync(outputDir, { recursive: true });
    // Props file shape must match FinalVideo's prop: { config: RemotionScenePlan }
    fs.writeFileSync(propsFile, JSON.stringify({ config: scenePlan }));

    const cmd = [
      "npx remotion render",
      "remotion/Root.tsx",
      "FinalVideo",
      `"${outputFile}"`,
      `--props="${propsFile}"`,
      "--codec=h264",
      "--log=error",
    ].join(" ");

    console.log("[render] starting:", cmd);
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: projectRoot,
      timeout: 270_000,
      maxBuffer: 1024 * 1024 * 10,
    });

    if (stdout) console.log("[render] stdout:", stdout.slice(-500));
    if (stderr) console.log("[render] stderr:", stderr.slice(-300));

  } catch (err) {
    console.error("[render] exec error:", err);
    try { fs.unlinkSync(propsFile); } catch { /* ignore */ }
    return NextResponse.json(
      { error: String(err), fallback_url: validShots[0]?.clip_url ?? "" },
      { status: 500 }
    );
  }

  // Clean up temp props file
  try { fs.unlinkSync(propsFile); } catch { /* ignore */ }

  if (!fs.existsSync(outputFile)) {
    return NextResponse.json({ error: "Render completed but output file not found" }, { status: 500 });
  }

  const data = fs.readFileSync(outputFile);
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type":        "video/mp4",
      "Content-Disposition": 'attachment; filename="reel.mp4"',
      "Content-Length":      String(data.byteLength),
    },
  });
}
