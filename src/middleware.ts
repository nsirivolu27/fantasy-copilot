import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional site lock for public deployments.
 *
 * The app has no user accounts by design. If you host it where anyone can
 * reach the URL, set APP_PASSWORD and every page is gated behind HTTP Basic
 * auth (username is ignored). Leave APP_PASSWORD unset and the app is open,
 * which is the right default for localhost.
 *
 * This is a shared-password gate for you and your leaguemates, not real
 * multi-user auth. Don't put anything sensitive behind it.
 */
export function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (timingSafeEqual(supplied, password)) return NextResponse.next();
    } catch {
      // Malformed header — fall through to the challenge.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Fantasy Copilot", charset="UTF-8"' },
  });
}

/** Constant-time compare so the gate doesn't leak the password by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except Next internals, the health check (so uptime probes keep
  // working) and /api/sync (which has its own bearer-token check, because a
  // cron job can't do Basic auth).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/sync).*)"],
};
