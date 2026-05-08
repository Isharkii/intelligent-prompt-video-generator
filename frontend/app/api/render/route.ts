/**
 * POST /api/render
 *
 * Downloads the Higgsfield clip URLs and concatenates them into a single MP4
 * using ffmpeg.wasm (no system dependency, runs on Vercel).
 *
 * Body: { shots: GeneratedShot[], caption?: CaptionCopy }
 * Returns: MP4 file stream
 */

import { NextRequest, NextResponse } from "next/server";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { GeneratedShot, CaptionCopy } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json() as { shots: GeneratedShot[]; caption?: CaptionCopy };
  const { shots, caption } = body;

  const validShots = (shots ?? []).filter((s) => s.status === "success" && s.clip_url);
  if (validShots.length === 0) {
    return NextResponse.json({ error: "No valid shots to render" }, { status: 400 });
  }

  try {
    const ffmpeg = new FFmpeg();

    // Load ffmpeg core wasm
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ffmpeg.load({
      coreURL:   await toBlobURL(`${baseURL}/ffmpeg-core.js`,   "text/javascript"),
      wasmURL:   await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    // Download and write each clip
    const inputNames: string[] = [];
    for (let i = 0; i < validShots.length; i++) {
      const name = `clip${i}.mp4`;
      const data = await fetchFile(validShots[i].clip_url!);
      await ffmpeg.writeFile(name, data);
      inputNames.push(name);
    }

    // Write concat list file
    const concatList = inputNames.map((n) => `file '${n}'`).join("\n");
    await ffmpeg.writeFile("list.txt", concatList);

    // Caption overlay text for the first frame
    const hookText = caption?.hook_line
      ? caption.hook_line.replace(/'/g, "\\'").slice(0, 60)
      : "";

    // Concatenate clips, overlay caption on first 3s
    const filterArgs: string[] = [];
    if (hookText) {
      filterArgs.push(
        "-vf",
        `drawtext=text='${hookText}':fontsize=40:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-100:enable='between(t,0,3)'`
      );
    }

    await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-c", "copy",
      ...filterArgs,
      "-movflags", "+faststart",
      "output.mp4",
    ]);

    const raw  = await ffmpeg.readFile("output.mp4");
    const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw as unknown as ArrayBuffer);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type":        "video/mp4",
        "Content-Disposition": 'attachment; filename="reel.mp4"',
        "Content-Length":      String(data.byteLength),
      },
    });

  } catch (err) {
    console.error("[render] ffmpeg error:", err);
    // Fallback: redirect to first clip if assembly fails
    return NextResponse.json(
      { error: String(err), fallback_url: validShots[0]?.clip_url ?? "" },
      { status: 500 }
    );
  }
}
