import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, AUTH_COOKIE_NAME } from "@/lib/config";

const AUTH_ROUTES = new Set(["auth/login", "auth/register", "auth/logout", "auth/me"]);

async function handle(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const route = path.join("/");

  if (AUTH_ROUTES.has(route)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const upstream = `${API_BASE_URL}/api/${route}${req.nextUrl.search}`;
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;

  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  if (req.headers.get("accept")) headers["accept"] = req.headers.get("accept")!;

  const isBodyless = req.method === "GET" || req.method === "HEAD";
  const upstreamRes = await fetch(upstream, {
    method: req.method,
    headers,
    body: isBodyless ? undefined : await req.text(),
    cache: "no-store",
  });

  const body = await upstreamRes.text();
  return new NextResponse(body, {
    status: upstreamRes.status,
    headers: {
      "content-type": upstreamRes.headers.get("content-type") ?? "application/json",
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;