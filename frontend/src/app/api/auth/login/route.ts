import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, AUTH_COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/config";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const upstreamRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await upstreamRes.json().catch(() => ({}));
  if (!upstreamRes.ok) {
    return NextResponse.json(data, { status: upstreamRes.status });
  }

  const response = NextResponse.json(data);
  response.cookies.set(AUTH_COOKIE_NAME, data.token as string, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}