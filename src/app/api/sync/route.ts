import { NextResponse } from "next/server";
import { syncAllLeagues, syncLeague } from "@/lib/sync/syncLeague";
import type { PlatformId } from "@/lib/platforms";

export const dynamic = "force-dynamic";

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
