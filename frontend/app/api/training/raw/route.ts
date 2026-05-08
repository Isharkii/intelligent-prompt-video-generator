import { NextRequest, NextResponse } from "next/server";

const B = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await fetch(`${B}/api/training/raw`);
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function PUT(req: NextRequest) {
  const body = await req.text();
  const r = await fetch(`${B}/api/training/raw`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return NextResponse.json(await r.json(), { status: r.status });
}
