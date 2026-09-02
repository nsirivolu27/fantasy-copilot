import { NextResponse } from "next/server";
import { syncAllLeagues, syncLeague } from "@/lib/sync/syncLeague";
import type { PlatformId } from "@/lib/platforms";

export const dynamic = "force-dynamic";
// Syncing hits the Sleeper API and writes every roster, so give it room.
export const maxDuration = 60;

/**
 * When SYNC_SECRET is set, this endpoint requires
 * `Authorization: Bearer <SYNC_SECRET>`. Set it on any public deployment so a
 * stranger can't trigger syncs against your database; the scheduled job sends
 * the same header. Unset (localhost) means open.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * Manual/scheduled sync endpoint.
 *
 *   POST /api/sync                          -> refresh every known league
 *   POST /api/sync { platform, leagueId }   -> refresh one
 *
 * Structured so a nightly scheduled job can call it with no body in a later
 * phase. Read-only against the platform; no credentials involved.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { platform?: string; leagueId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — that means "sync everything".
  }

  try {
    if (body.leagueId) {
      const result = await syncLeague((body.platform ?? "sleeper") as PlatformId, body.leagueId);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    const results = await syncAllLeagues();
    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/sync]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel Cron sends GET. Same auth, same behavior: refresh every league. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await syncAllLeagues();
    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/sync]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
