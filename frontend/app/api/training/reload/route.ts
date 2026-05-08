import { NextResponse } from "next/server";

const B = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function POST() {
  const r = await fetch(`${B}/api/training/reload`, { method: "POST" });
  return NextResponse.json(await r.json(), { status: r.status });
}
