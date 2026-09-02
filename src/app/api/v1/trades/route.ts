import { authenticate } from "@/lib/api/auth";
import { fail, ok, unauthorized } from "@/lib/api/respond";
import { emit } from "@/lib/api/webhooks";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getActiveLeague } from "@/lib/settings";
import { evaluate } from "@/lib/trade/service";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "proposed", "accepted", "declined", "expired", "withdrawn"];

/** GET /api/v1/trades?status=proposed — recorded proposals. */
export async function GET(request: Request) {
  const auth = await authenticate(request, "read:trades");
  if (!auth.ok) return unauthorized(auth);

  const league = await getActiveLeague();
  if (!league) return fail("No league is synced yet.", 404);

  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  if (status && !STATUSES.includes(status)) {
    return fail(`status must be one of: ${STATUSES.join(", ")}.`, 400);
  }

  const rows = await prisma.tradeProposal.findMany({
    where: { leagueId: league.id, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return ok(
    rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      origin: r.origin,
      status: r.status,
      fromTeamId: r.fromTeamId,
      toTeamId: r.toTeamId,
      fromPlayerIds: parseJson<string[]>(r.fromPlayersJson, []),
      toPlayerIds: parseJson<string[]>(r.toPlayersJson, []),
      message: r.message,
      evaluation: r.evaluationJson ? parseJson<unknown>(r.evaluationJson, null) : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  );
}

/**
 * POST /api/v1/trades — record a proposal.
 *
 * Body: { fromTeamId, toTeamId, fromPlayerIds[], toPlayerIds[],
 *         status?, externalId?, message? }
 *
 * externalId is the trading app's own id. It's unique per league, so posting
 * the same proposal twice updates rather than duplicates — safe to retry.
 */
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

  const fromTeamId = String(body.fromTeamId ?? "");
  const toTeamId = String(body.toTeamId ?? "");
  if (!fromTeamId || !toTeamId) return fail("fromTeamId and toTeamId are required.", 400);

  const status = String(body.status ?? "proposed");
  if (!STATUSES.includes(status)) {
    return fail(`status must be one of: ${STATUSES.join(", ")}.`, 400);
  }

  const fromPlayerIds = asStringArray(body.fromPlayerIds);
  const toPlayerIds = asStringArray(body.toPlayerIds);
  const externalId = body.externalId ? String(body.externalId) : null;

  // Attach an evaluation so consumers get the verdict without a second call.
  let evaluationJson: string | null = null;
  try {
    const evaluation = await evaluate({
      leagueId: league.id,
      fromTeamId,
      toTeamId,
      fromPlayerIds,
      toPlayerIds,
    });
    evaluationJson = JSON.stringify(evaluation);
  } catch {
    // A proposal referencing players we haven't synced is still worth storing.
  }

  const data = {
    leagueId: league.id,
    fromTeamId,
    toTeamId,
    fromPlayersJson: JSON.stringify(fromPlayerIds),
    toPlayersJson: JSON.stringify(toPlayerIds),
    status,
    origin: auth.label ?? "api",
    externalId,
    message: body.message ? String(body.message) : null,
    evaluationJson,
  };

  const saved = externalId
    ? await prisma.tradeProposal.upsert({
        where: { leagueId_externalId: { leagueId: league.id, externalId } },
        create: data,
        update: data,
      })
    : await prisma.tradeProposal.create({ data });

  void emit("trade.proposed", { id: saved.id, externalId, status, fromTeamId, toTeamId });

  return ok({ id: saved.id, status: saved.status, evaluation: evaluationJson ? JSON.parse(evaluationJson) : null });
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
