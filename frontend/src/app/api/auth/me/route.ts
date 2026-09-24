import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/config";

export async function GET(req: NextRequest) {
  const authenticated = Boolean(req.cookies.get(AUTH_COOKIE_NAME)?.value);
  return NextResponse.json({ authenticated });
}