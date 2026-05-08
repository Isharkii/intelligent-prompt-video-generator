import { NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function POST() {
  const upstream = await fetch(`${BACKEND}/api/retry`, { method: "POST" });

  // If the server returns a JSON error (409, 400) before streaming, pass it through
  const contentType = upstream.headers.get("Content-Type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  }

  // Pass the SSE stream straight through
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const dynamic = "force-dynamic";
