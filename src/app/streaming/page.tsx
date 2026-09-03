import Link from "next/link";
import { getActiveLeague } from "@/lib/settings";
import { getSportModule } from "@/lib/sports";
import { getStreamers } from "@/lib/waivers/service";
import { Badge, Banner, Card, CardHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Green when the defense is generous to this position, red when it's stingy. */
function matchupClass(multiplier: number | null): string {
  if (multiplier == null) return "bg-white/5 text-[var(--muted)] ring-white/10";
  if (multiplier >= 1.12) return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
  if (multiplier >= 1.02) return "bg-emerald-500/10 text-emerald-200/80 ring-emerald-500/20";
  if (multiplier <= 0.88) return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  if (multiplier <= 0.98) return "bg-amber-500/10 text-amber-200/80 ring-amber-500/20";
  return "bg-white/5 text-[var(--muted)] ring-white/10";
}

export default async function StreamingPage() {
  const league = await getActiveLeague();
  if (!league) {
    return (
      <EmptyState
        title="No league synced"
        body="Sync your league in Settings and this becomes your streaming planner."
        action={
          <Link href="/settings" className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">
            Go to Settings
          </Link>
        }
      />
    );
  }

  let result;
  try {
    result = await getStreamers(league.id);
  } catch (err) {
    return (
      <Banner tone="error" title="Couldn't build the streaming planner">
        {err instanceof Error ? err.message : "Unknown error."}
      </Banner>
    );
  }

  const sport = getSportModule(league.sport);
  const positions = Object.keys(result.byPosition);
  const empty = positions.every((p) => result.byPosition[p].length === 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Streaming — weeks {result.week}–{result.week + 2}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Plan two weeks ahead instead of scrambling on Saturday night. Colour shows how generous
          each defense has been to the position.
        </p>
      </div>

      {empty ? (
        <Banner tone="warn" title="Not enough data yet">
          Streaming needs this season&apos;s stats and schedule.{" "}
          <Link href="/settings" className="underline">
            Refresh projections in Settings
          </Link>{" "}
          to pull both.
        </Banner>
      ) : null}

      {positions.map((position) => {
        const options = result.byPosition[position];
        if (options.length === 0) return null;
        return (
          <Card key={position}>
            <CardHeader
              title={sport.slotLabel(position)}
              subtitle={`${options.length} available, best three-week outlook first`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-4 py-2 text-left font-medium">Player</th>
                    <th className="px-2 py-2 text-right font-medium">Proj</th>
                    {[0, 1, 2].map((i) => (
                      <th key={i} className="px-2 py-2 text-center font-medium">
                        Wk {result.week + i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {options.map((o) => (
                    <tr key={o.playerId} className="border-t border-[var(--border)]/60">
                      <td className="px-4 py-2">
                        <span className="font-medium">{o.name}</span>
                        <span className="ml-2 text-[11px] text-[var(--muted)]">{o.nflTeam}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {o.projectedPoints > 0 ? o.projectedPoints.toFixed(1) : "—"}
                      </td>
                      {o.schedule.map((s) => (
                        <td key={s.week} className="px-2 py-2 text-center">
                          <Badge className={matchupClass(s.multiplier)}>
                            {s.opponent ?? "BYE"}
                          </Badge>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      <p className="text-xs text-[var(--muted)]">
        Defensive strength is points allowed to the position this season, relative to the league
        average. Early in a season those samples are small — treat a single green cell lightly.
      </p>
    </div>
  );
}
