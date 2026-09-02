import { authenticate } from "@/lib/api/auth";
import { fail, ok, unauthorized } from "@/lib/api/respond";
import { getActiveLeague } from "@/lib/settings";
import { evaluate } from "@/lib/trade/service";
import { VERDICT_LABEL } from "@/lib/core";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/v1/trades/evaluate
 *
 * Body: { fromTeamId, toTeamId, fromPlayerIds[], toPlayerIds[] }
 *
 * Stateless — evaluates a hypothetical without recording anything, which is
 * what a trading app's "what if" preview wants.
 */
export async function POST(request: Request) {
  const auth = await authenticate(request, "read:trades");
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
  if (!fromTeamId || !toTeamId) {
    return fail("fromTeamId and toTeamId are required.", 400);
  }
  if (fromTeamId === toTeamId) {
    return fail("A team cannot trade with itself.", 400);
  }

  const fromPlayerIds = asStringArray(body.fromPlayerIds);
  const toPlayerIds = asStringArray(body.toPlayerIds);
  if (fromPlayerIds.length === 0 && toPlayerIds.length === 0) {
    return fail("At least one side must send a player.", 400);
  }

  try {
    const evaluation = await evaluate({
      leagueId: league.id,
      fromTeamId,
      toTeamId,
      fromPlayerIds,
      toPlayerIds,
    });
    return ok({ ...evaluation, verdictLabel: VERDICT_LABEL[evaluation.verdict] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failed.";
    return fail(message, 400);
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
