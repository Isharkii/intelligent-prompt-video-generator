import { NextRequest, NextResponse } from "next/server";

const B = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  const text = await req.text();
  const r = await fetch(`${B}/api/training/upload-csv`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: text,
  });
  return NextResponse.json(await r.json(), { status: r.status });
}
