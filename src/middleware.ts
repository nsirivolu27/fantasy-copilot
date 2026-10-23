import { NextResponse, type NextRequest } from "next/server";

/**
 * Two gates, in order.
 *
 * REQUIRE_AUTH=1 turns on accounts. Middleware runs on the edge runtime, where
 * neither the database nor node:crypto is available, so it only checks that a
 * session cookie exists and redirects when it does not. Every page validates
 * the session properly server-side; this just avoids rendering the app shell
 * for someone with no cookie at all.
 *
 * APP_PASSWORD is the older shared-password gate, kept for a private
 * single-user deployment where accounts are overkill. If both are set,
 * accounts win and the shared password is ignored.
 */

const SESSION_COOKIE = "fc_session";
const PUBLIC_PATHS = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.REQUIRE_AUTH === "1") {
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
    if (request.cookies.get(SESSION_COOKIE)) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (timingSafeEqual(supplied, password)) return NextResponse.next();
    } catch {
      // Malformed header falls through to the challenge.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Fantasy Copilot", charset="UTF-8"' },
  });
}

/** Constant-time compare so the gate does not leak the password by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except Next internals, the health check (so uptime probes keep
  // working) and /api/sync and /api/mcp, which carry their own bearer auth.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/sync|api/mcp).*)"],
};
