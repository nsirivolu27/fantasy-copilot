import Link from "next/link";
import { getActiveLeague } from "@/lib/settings";
import { getSportModule } from "@/lib/sports";
import { getWaiverReport } from "@/lib/waivers/service";
import { Badge, Banner, Card, CardHeader, EmptyState, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function WaiversPage() {
  const league = await getActiveLeague();
  if (!league) {
    return (
      <EmptyState
        title="No league synced"
        body="Sync your league in Settings and this becomes your waiver board."
        action={
          <Link href="/settings" className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]">
            Go to Settings
          </Link>
        }
      />
    );
  }

  let report;
  try {
    report = await getWaiverReport(league.id);
  } catch (err) {
    return (
      <Banner tone="bad" title="Couldn't build the waiver board">
        {err instanceof Error ? err.message : "Unknown error."} Your synced data is untouched.
      </Banner>
    );
  }

  if (!report) {
    return (
      <EmptyState
        title="Pick your team first"
        body="Choose which synced team is yours in Settings, and waiver targets get ranked for that roster."
        action={
          <Link href="/settings" className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]">
            Go to Settings
          </Link>
        }
      />
    );
  }

  const sport = getSportModule(league.sport);
  const isFaab = report.waiverType === "faab";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Waivers, week {report.week}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {report.teamName} · ranked by what each adds to <em>your</em> starting lineup, not by raw
          projection
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Waivers" value={isFaab ? "FAAB" : "Priority"} hint={isFaab ? "bids below" : "claims"} />
        <Stat
          label="Budget left"
          value={report.budgetRemaining != null ? `$${report.budgetRemaining}` : "-"}
        />
        <Stat label="Considered" value={report.candidatesConsidered} hint="free agents projected" />
      </div>

      {report.targets.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm font-medium">Nothing on waivers improves your lineup.</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              That&apos;s a good sign, not a bug, every free agent projects below what you already
              start. Check back after injuries settle.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Targets" subtitle={`${report.targets.length} free agents who crack your lineup`} />
          <ul className="divide-y divide-[var(--border)]">
            {report.targets.map(({ ranking, faab, trendingAdds, confidence }) => (
              <li key={ranking.player.playerId} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={sport.positionColor(ranking.player.position)}>
                    {ranking.player.position}
                  </Badge>
                  <span className="font-semibold">{ranking.player.name}</span>
                  {ranking.player.injuryStatus ? (
                    <Badge tone="bad">
                      {ranking.player.injuryStatus}
                    </Badge>
                  ) : null}
                  <Badge className="ml-auto tint-good">
                    +{ranking.lineupGain.toFixed(1)}/wk
                  </Badge>
                </div>

                <p className="mt-1.5 text-[13px] text-[var(--muted)]">
                  Projects {ranking.player.projectedPoints.toFixed(1)}
                  {ranking.displaces
                    ? `, replacing ${ranking.displaces.name} (${ranking.displaces.projectedPoints.toFixed(1)}) in your lineup`
                    : " and slots straight in"}
                  . Confidence {(confidence * 100).toFixed(0)}%.
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {isFaab && faab.bid != null ? (
                    <Badge tone="accent">
                      Bid ${faab.bid}
                      {faab.percentOfRemaining != null ? ` (${faab.percentOfRemaining.toFixed(0)}%)` : ""}
                    </Badge>
                  ) : (
                    <Badge
                      className={
                        faab.worthTheClaim
                          ? "tint-good"
                          : "bg-[var(--panel-2)] text-[var(--muted)] border-[var(--border)]"
                      }
                    >
                      {faab.worthTheClaim ? "Worth a claim" : "Not worth a claim"}
                    </Badge>
                  )}
                  {trendingAdds != null ? (
                    <Badge
                      tone="neutral"
                      title="Sleeper adds in the last 24h. Market hype, shown for context, not part of the ranking."
                    >
                      {trendingAdds.toLocaleString()} adds / 24h
                    </Badge>
                  ) : null}
                </div>

                <ul className="mt-1.5 space-y-0.5 text-[12px] text-[var(--muted)]">
                  {faab.reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Drop candidates"
          subtitle="Ranked by what your lineup loses, so a backup QB with no replacement outranks a spare RB"
        />
        <ul className="divide-y divide-[var(--border)]">
          {report.drops.map((d) => (
            <li key={d.player.playerId} className="flex items-center gap-3 px-4 py-2.5">
              <Badge className={sport.positionColor(d.player.position)}>{d.player.position}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm">{d.player.name}</span>
              {d.isProtected ? (
                <Badge tone="info">Protected</Badge>
              ) : null}
              <span className="w-20 shrink-0 text-right text-[12px] text-[var(--muted)] tabular-nums">
                −{d.lineupCost.toFixed(1)}/wk
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-[var(--muted)]">
        Free agents are projected on the fly from their nflverse history using your league&apos;s
        scoring. Trending-add counts come from Sleeper and are shown as market context only, they
        never affect the ranking.
      </p>
    </div>
  );
}
