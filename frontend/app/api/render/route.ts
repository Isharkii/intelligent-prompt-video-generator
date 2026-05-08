/**
 * POST /api/render
 *
 * Downloads Higgsfield clips and concatenates into a single MP4 using
 * ffmpeg.wasm. If ELEVENLABS_API_KEY is set, generates voiceover audio
 * and mixes it into the final video.
 *
 * Body: { shots: GeneratedShot[], voiceover?: { hook_line, body_script, outro_line }, caption?: CaptionCopy }
 * Returns: MP4 stream
 */

import { NextRequest, NextResponse } from "next/server";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { GeneratedShot, CaptionCopy } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface VoiceoverScript {
  hook_line: string;
  body_script: string;
  outro_line: string;
}

async function generateVoiceover(script: VoiceoverScript): Promise<Uint8Array | null> {
  const apiKey   = process.env.ELEVENLABS_API_KEY;
  const voiceId  = process.env.ELEVENLABS_VOICE_ID  ?? "21m00Tcm4TlvDq8ikWAM";
  const modelId  = process.env.ELEVENLABS_MODEL      ?? "eleven_multilingual_v2";

  if (!apiKey || apiKey === "your_elevenlabs_key_here") return null;

  const fullText = [script.hook_line, script.body_script, script.outro_line]
    .filter(Boolean).join(" ");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method:  "POST",
      headers: {
        "xi-api-key":   apiKey,
        "Content-Type": "application/json",
        "Accept":       "audio/mpeg",
      },
      body: JSON.stringify({
        text:       fullText,
        model_id:   modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!res.ok) {
    console.error("[render] ElevenLabs TTS failed:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    shots:     GeneratedShot[];
    voiceover?: VoiceoverScript;
    caption?:  CaptionCopy;
  };
  const { shots, voiceover } = body;

  const validShots = (shots ?? []).filter((s) => s.status === "success" && s.clip_url);
  if (validShots.length === 0) {
    return NextResponse.json({ error: "No valid shots to render" }, { status: 400 });
  }

  try {
    const ffmpeg = new FFmpeg();

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`,   "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    // Download and write each clip
    for (let i = 0; i < validShots.length; i++) {
      await ffmpeg.writeFile(`clip${i}.mp4`, await fetchFile(validShots[i].clip_url!));
    }

    // Concat list
    const concatList = validShots.map((_, i) => `file 'clip${i}.mp4'`).join("\n");
    await ffmpeg.writeFile("list.txt", concatList);

    // Generate voiceover if ElevenLabs key is available
    const audioData = voiceover ? await generateVoiceover(voiceover) : null;

    let outputArgs: string[];

    if (audioData) {
      // Write audio file and mix with video
      await ffmpeg.writeFile("voiceover.mp3", audioData);
      await ffmpeg.exec([
        "-f", "concat", "-safe", "0", "-i", "list.txt",
        "-i", "voiceover.mp3",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        "-movflags", "+faststart",
        "output.mp4",
      ]);
      outputArgs = [];
    } else {
      // No audio — simple concat, copy streams
      await ffmpeg.exec([
        "-f", "concat", "-safe", "0", "-i", "list.txt",
        "-c", "copy",
        "-movflags", "+faststart",
        "output.mp4",
      ]);
      outputArgs = [];
    }

    void outputArgs; // unused, kept for clarity

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
    console.error("[render] error:", err);
    return NextResponse.json(
      { error: String(err), fallback_url: validShots[0]?.clip_url ?? "" },
      { status: 500 }
    );
  }
}
