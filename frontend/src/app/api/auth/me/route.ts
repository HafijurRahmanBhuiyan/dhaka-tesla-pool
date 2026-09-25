import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, AUTH_COOKIE_NAME } from "@/lib/config";
import type { UserProfile } from "@/lib/types";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false, role: null });
  }

  const res = await fetch(`${API_BASE_URL}/api/users/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ authenticated: false, role: null });
  }

  const data = (await res.json()) as { user: UserProfile };
  return NextResponse.json({
    authenticated: true,
    role: data.user.role,
    user: data.user,
  });
}