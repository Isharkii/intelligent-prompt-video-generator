import { NextRequest, NextResponse } from "next/server";

const B = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function DELETE(_req: NextRequest, { params }: { params: { index: string } }) {
  const r = await fetch(`${B}/api/training/banned/${params.index}`, { method: "DELETE" });
  return NextResponse.json(await r.json(), { status: r.status });
}
