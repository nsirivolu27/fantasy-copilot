import Link from "next/link";
import { getActiveLeague } from "@/lib/settings";
import { getSportModule } from "@/lib/sports";
import { getStartSitAdvice } from "@/lib/lineup/service";
import { Badge, Banner, Card, CardHeader, EmptyState, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LineupPage() {
  const league = await getActiveLeague();
  if (!league) {
    return (
      <EmptyState
        title="No league synced"
        body="Sync your league in Settings and this becomes your weekly start/sit page."
        action={
          <Link href="/settings" className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">
            Go to Settings
          </Link>
        }
      />
    );
  }

  const advice = await getStartSitAdvice(league.id);
  if (!advice) {
    return (
      <EmptyState
        title="Pick your team first"
        body="Choose which of the synced teams is yours in Settings, and this page will optimize its lineup."
        action={
          <Link href="/settings" className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">
            Go to Settings
          </Link>
        }
      />
    );
  }

  const sport = getSportModule(league.sport);
  const critical = advice.alerts.filter((a) => a.severity === "critical");
  const warnings = advice.alerts.filter((a) => a.severity === "warning");
  const realChanges = advice.changes.filter((c) => !c.isCoinFlip);
  const coinFlips = advice.changes.filter((c) => c.isCoinFlip);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Start/sit — week {advice.week}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{advice.teamName}</p>
      </div>

      {!advice.hasProjections ? (
        <Banner tone="warn" title="No projections for this week">
          Without them the optimizer has nothing to rank.{" "}
          <Link href="/settings" className="underline">
            Refresh projections in Settings
          </Link>
          .
        </Banner>
      ) : null}

      {critical.map((a, i) => (
        <Banner key={i} tone="error" title={a.message} />
      ))}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Current" value={advice.currentTotal.toFixed(1)} hint="projected" />
        <Stat label="Optimal" value={advice.optimalTotal.toFixed(1)} hint="projected" />
        <Stat
          label="Gain"
          value={advice.pointsGained > 0 ? `+${advice.pointsGained.toFixed(1)}` : "0.0"}
          hint={advice.pointsGained > 0 ? "from the changes below" : "already optimal"}
        />
      </div>

      {realChanges.length === 0 && coinFlips.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm font-medium">Your lineup is already optimal.</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Nothing on your bench projects higher than what you&apos;re starting.
            </p>
          </div>
        </Card>
      ) : null}

      {realChanges.length > 0 ? (
        <Card>
          <CardHeader
            title={`${realChanges.length} change${realChanges.length > 1 ? "s" : ""} worth making`}
            subtitle={`Worth ${advice.pointsGained.toFixed(1)} projected points`}
          />
          <ul className="divide-y divide-[var(--border)]">
            {realChanges.map((c) => (
              <li key={c.slotIndex} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-white/5 text-[var(--muted)] ring-white/10">
                    {sport.slotLabel(c.slot)}
                  </Badge>
                  <span className="text-sm">
                    {c.out ? (
                      <>
                        <span className="text-[var(--muted)] line-through">{c.out.name}</span>
                        <span className="mx-2 text-[var(--muted)]">→</span>
                      </>
                    ) : null}
                    <span className="font-semibold">{c.in.name}</span>
                  </span>
                  <Badge className="ml-auto bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">
                    +{c.gain.toFixed(1)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[13px] text-[var(--muted)]">{c.reason}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {c.in.name}: {c.in.projectedPoints.toFixed(1)} projected
                  {c.out ? ` · ${c.out.name}: ${c.out.projectedPoints.toFixed(1)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {coinFlips.length > 0 ? (
        <Card>
          <CardHeader
            title="Coin flips"
            subtitle="Under 1.5 points apart — either choice is defensible, so this isn't a recommendation"
          />
          <ul className="divide-y divide-[var(--border)]">
            {coinFlips.map((c) => (
              <li key={c.slotIndex} className="flex flex-wrap items-center gap-2 p-4">
                <Badge className="bg-white/5 text-[var(--muted)] ring-white/10">
                  {sport.slotLabel(c.slot)}
                </Badge>
                <span className="text-sm text-[var(--muted)]">
                  {c.out?.name} ({c.out?.projectedPoints.toFixed(1)}) or {c.in.name} (
                  {c.in.projectedPoints.toFixed(1)})
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Optimal lineup" subtitle={`${advice.optimalTotal.toFixed(1)} projected points`} />
        <ul className="divide-y divide-[var(--border)]">
          {advice.optimal.assignments.map((a) => (
            <li key={a.slotIndex} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-14 shrink-0 text-[11px] text-[var(--muted)]">
                {sport.slotLabel(a.slot)}
              </span>
              {a.player ? (
                <>
                  <Badge className={sport.positionColor(a.player.position)}>{a.player.position}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">{a.player.name}</span>
                  {a.player.injuryStatus ? (
                    <Badge className="bg-amber-500/15 text-amber-300 ring-amber-500/30">
                      {a.player.injuryStatus}
                    </Badge>
                  ) : null}
                  <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {a.player.projectedPoints.toFixed(1)}
                  </span>
                </>
              ) : (
                <span className="flex-1 text-sm text-[var(--muted)]">— empty —</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {warnings.length > 0 ? (
        <Card>
          <CardHeader title="Worth knowing" />
          <ul className="space-y-1.5 p-4 text-[13px] text-[var(--muted)]">
            {warnings.map((a, i) => (
              <li key={i}>{a.message}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
