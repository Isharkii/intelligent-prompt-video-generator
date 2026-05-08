import { NextRequest, NextResponse } from "next/server";

const B = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function GET() {
  const r = await fetch(`${B}/api/training/vocabulary`);
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const r = await fetch(`${B}/api/training/vocabulary`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}
