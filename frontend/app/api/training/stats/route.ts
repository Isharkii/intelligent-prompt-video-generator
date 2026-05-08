import { NextResponse } from "next/server";

const B = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await fetch(`${B}/api/training/stats`);
  return NextResponse.json(await r.json(), { status: r.status });
}
