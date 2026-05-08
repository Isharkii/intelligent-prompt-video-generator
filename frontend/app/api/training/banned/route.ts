import { NextRequest, NextResponse } from "next/server";

const B = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await fetch(`${B}/api/training/banned`);
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const r = await fetch(`${B}/api/training/banned`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

// Phrase-based delete — body: { phrase: string }
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const r = await fetch(`${B}/api/training/banned`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}
