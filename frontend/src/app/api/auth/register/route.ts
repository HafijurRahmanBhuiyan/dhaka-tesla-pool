import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, AUTH_COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/config";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const registerRes = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const registerData = await registerRes.json().catch(() => ({}));
  if (!registerRes.ok) {
    return NextResponse.json(registerData, { status: registerRes.status });
  }

  const identifier = (registerData.user?.email ?? body.email) as string | undefined;
  const password = body.password as string | undefined;
  if (!identifier || !password) {
    return NextResponse.json(registerData, { status: 201 });
  }

  const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    cache: "no-store",
  });
  const loginData = await loginRes.json().catch(() => ({}));

  if (!loginRes.ok || !loginData.token) {
    return NextResponse.json(registerData, { status: 201 });
  }

  const response = NextResponse.json(loginData);
  response.cookies.set(AUTH_COOKIE_NAME, loginData.token as string, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}