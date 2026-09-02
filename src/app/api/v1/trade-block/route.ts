import { authenticate } from "@/lib/api/auth";
import { fail, ok, unauthorized } from "@/lib/api/respond";
import { emit } from "@/lib/api/webhooks";
import { prisma } from "@/lib/db";
import { getActiveLeague } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** GET /api/v1/trade-block — who is advertising what. */
export async function GET(request: Request) {
  const auth = await authenticate(request, "read:trades");
  if (!auth.ok) return unauthorized(auth);

  const league = await getActiveLeague();
  if (!league) return fail("No league is synced yet.", 404);

  const rows = await prisma.tradeBlock.findMany({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  const players = await prisma.player.findMany({
    where: { id: { in: rows.map((r) => r.playerId) } },
    select: { id: true, fullName: true, position: true, nflTeam: true },
  });
  const byId = new Map(players.map((p) => [p.id, p]));
  const teams = await prisma.team.findMany({ where: { leagueId: league.id } });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  return ok(
    rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      teamName: teamById.get(r.teamId)?.name ?? null,
      playerId: r.playerId,
      player: byId.get(r.playerId) ?? null,
      intent: r.intent,
      note: r.note,
      createdAt: r.createdAt,
    })),
  );
}

/** POST /api/v1/trade-block — { teamId, playerId, intent?, note? } */
export async function POST(request: Request) {
  const auth = await authenticate(request, "write:trades");
  if (!auth.ok) return unauthorized(auth);

  const league = await getActiveLeague();
  if (!league) return fail("No league is synced yet.", 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const teamId = String(body.teamId ?? "");
  const playerId = String(body.playerId ?? "");
  const intent = String(body.intent ?? "available");
  if (!teamId || !playerId) return fail("teamId and playerId are required.", 400);
  if (intent !== "available" && intent !== "seeking") {
    return fail('intent must be "available" or "seeking".', 400);
  }

  const saved = await prisma.tradeBlock.upsert({
    where: { teamId_playerId_intent: { teamId, playerId, intent } },
    create: { leagueId: league.id, teamId, playerId, intent, note: body.note ? String(body.note) : null },
    update: { note: body.note ? String(body.note) : null },
  });

  void emit("trade_block.updated", { teamId, playerId, intent });
  return ok({ id: saved.id, teamId, playerId, intent });
}

/** DELETE /api/v1/trade-block?id=… */
export async function DELETE(request: Request) {
  const auth = await authenticate(request, "write:trades");
  if (!auth.ok) return unauthorized(auth);

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return fail("id is required.", 400);

  await prisma.tradeBlock.delete({ where: { id } }).catch(() => {});
  void emit("trade_block.updated", { removed: id });
  return ok({ removed: id });
}
