import { authenticate } from "@/lib/api/auth";
import { fail, ok, unauthorized } from "@/lib/api/respond";
import { prisma } from "@/lib/db";
import { getActiveLeague } from "@/lib/settings";
import { findTrades } from "@/lib/trade/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/v1/trades/suggest?teamId=…&limit=5
 *
 * One-for-one swaps that improve BOTH rosters, ranked so the fairest surface
 * first. This is the endpoint a trade marketplace wants for its feed.
 */
export async function GET(request: Request) {
  const auth = await authenticate(request, "read:trades");
  if (!auth.ok) return unauthorized(auth);

  const league = await getActiveLeague();
  if (!league) return fail("No league is synced yet.", 404);

  const params = new URL(request.url).searchParams;
  let teamId = params.get("teamId") ?? "";
  if (!teamId) {
    const mine = await prisma.team.findFirst({ where: { leagueId: league.id, isMine: true } });
    if (!mine) return fail("teamId is required, or mark a team as yours in Settings.", 400);
    teamId = mine.id;
  }

  const limit = Math.min(Number(params.get("limit") ?? 5) || 5, 25);

  try {
    const suggestions = await findTrades(league.id, teamId, limit);
    return ok(suggestions, {
      teamId,
      note: "Only mutually beneficial one-for-one swaps are returned. A trade that helps only one side won't be accepted anyway.",
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Suggestion run failed.", 400);
  }
}
