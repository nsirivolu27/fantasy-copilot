import { authenticate } from "@/lib/api/auth";
import { fail, ok, unauthorized } from "@/lib/api/respond";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getActiveLeague } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** GET /api/v1/projections?week=3 — every stored projection for the week. */
export async function GET(request: Request) {
  const auth = await authenticate(request, "read:projections");
  if (!auth.ok) return unauthorized(auth);

  const league = await getActiveLeague();
  if (!league) return fail("No league is synced yet.", 404);

  const weekParam = new URL(request.url).searchParams.get("week");
  const week = weekParam ? Number(weekParam) : league.currentWeek;
  if (!Number.isFinite(week)) return fail("week must be a number.", 400);

  const rows = await prisma.projection.findMany({
    where: { leagueId: league.id, season: league.season, week },
    include: { player: true },
    orderBy: { projectedPoints: "desc" },
  });

  return ok(
    rows.map((r) => ({
      playerId: r.playerId,
      name: r.player.fullName,
      position: r.player.position,
      nflTeam: r.player.nflTeam,
      projectedPoints: r.projectedPoints,
      floor: r.floor,
      ceiling: r.ceiling,
      confidence: r.confidence,
      reasoning: parseJson<string[]>(r.reasoningJson, []),
    })),
    {
      week,
      season: league.season,
      modelVersion: rows[0]?.modelVersion ?? null,
      // Stated on every response so an integrator can't mistake this for a
      // high-accuracy feed. See /model for the full backtest.
      accuracyNote:
        "Backtested on the 2024 season: 4.90 MAE vs 4.94 for a season average. A ~0.7% edge. Treat as a rough guide with floor and ceiling, not a precise forecast.",
    },
  );
}
