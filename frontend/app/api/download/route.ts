import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const file = searchParams.get("file");

  if (!file) {
    return NextResponse.json({ error: "Missing file param" }, { status: 400 });
  }

  // Security: only allow filenames (no path traversal)
  const basename = path.basename(file);
  if (basename !== file || file.includes("..") || file.includes("/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const upstream = await fetch(`${BACKEND}/output/${encodeURIComponent(basename)}`);

  if (!upstream.ok) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const contentType = upstream.headers.get("Content-Type") ?? "video/mp4";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${basename}"`,
    },
  });
}
