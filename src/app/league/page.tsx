import Link from "next/link";
import { getActiveLeague } from "@/lib/settings";
import { getLeagueHub } from "@/lib/league/service";
import { Banner, Card, CardHeader, EmptyState } from "@/components/ui";
import { DigestCopy } from "@/components/DigestCopy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function LeagueHubPage() {
  const league = await getActiveLeague();
  if (!league) {
    return (
      <EmptyState
        title="No league synced"
        body="Sync your league in Settings and this becomes the page your leaguemates open."
        action={
          <Link href="/settings" className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]">
            Go to Settings
          </Link>
        }
      />
    );
  }

  const hub = await getLeagueHub(league.id);
  if (!hub) {
    return <EmptyState title="No teams stored" body="Run a sync from Settings and try again." />;
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{league.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Power rankings, matchups and playoff odds, week {hub.week}
        </p>
      </div>

      {!hub.hasProjections ? (
        <Banner tone="warn" title="No projections this week">
          Win probabilities need them.{" "}
          <Link href="/settings" className="underline">
            Refresh projections
          </Link>{" "}
          to fill this in. Standings and power rankings work regardless.
        </Banner>
      ) : null}

      {hub.matchups.length > 0 ? (
        <Card>
          <CardHeader
            title={`Week ${hub.week} matchups`}
            subtitle="Win probability from 4,000 simulations of each starter's range"
          />
          <ul className="divide-y divide-[var(--border)]">
            {hub.matchups.map((m) => {
              const homeFavoured = (m.winProbability ?? 0.5) >= 0.5;
              return (
                <li key={m.matchupId} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${homeFavoured ? "font-semibold" : ""}`}>
                        {m.home.name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {m.home.actual > 0
                          ? `${m.home.actual.toFixed(1)} pts`
                          : `${m.home.projected.toFixed(1)} projected`}
                      </p>
                    </div>
                    {m.winProbability != null ? (
                      <div className="shrink-0 text-center">
                        <p className="font-mono text-sm tabular-nums">
                          {pct(m.winProbability)}, {pct(1 - m.winProbability)}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          win prob
                        </p>
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-[var(--muted)]">vs</span>
                    )}
                    <div className="min-w-0 flex-1 text-right">
                      <p className={`truncate text-sm ${!homeFavoured ? "font-semibold" : ""}`}>
                        {m.away.name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {m.away.actual > 0
                          ? `${m.away.actual.toFixed(1)} pts`
                          : `${m.away.projected.toFixed(1)} projected`}
                      </p>
                    </div>
                  </div>
                  {m.winProbability != null ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{ width: `${m.winProbability * 100}%` }}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Banner tone="info" title="No matchups stored for this week">
          Run a sync from Settings, matchups are pulled with it.
        </Banner>
      )}

      <Card>
        <CardHeader
          title="Power rankings"
          subtitle="70% scoring rate, 30% record, luck is actual wins minus what the scoring deserved"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="py-2 text-left font-medium">Team</th>
                <th className="px-2 py-2 text-right font-medium">Record</th>
                <th className="px-2 py-2 text-right font-medium">PF</th>
                <th className="px-2 py-2 text-right font-medium">Luck</th>
                <th className="px-2 py-2 text-right font-medium">Power</th>
                <th className="px-4 py-2 text-right font-medium">Playoffs</th>
              </tr>
            </thead>
            <tbody>
              {hub.rankings.map((t) => (
                <tr key={t.teamId} className="border-t border-[var(--border-soft)]">
                  <td className="px-4 py-2 text-[var(--muted)]">{t.rank}</td>
                  <td className="py-2 font-medium">{t.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {t.wins}-{t.losses}
                    {t.ties ? `-${t.ties}` : ""}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{t.pointsFor.toFixed(0)}</td>
                  <td className="px-2 py-2 text-right">
                    <span
                      className={
                        t.luck > 0.5
                          ? "text-[var(--good-fg)]"
                          : t.luck < -0.5
                            ? "text-[var(--bad-fg)]"
                            : "text-[var(--muted)]"
                      }
                      title="Actual wins minus expected wins"
                    >
                      {t.luck > 0 ? "+" : ""}
                      {t.luck.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    {t.powerScore.toFixed(0)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {pct(hub.playoffOdds[t.teamId] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-3 text-[11px] text-[var(--muted)]">
          Playoff odds assume {hub.playoffSpots} spots and approximate the remaining schedule as a
          round robin, because Sleeper doesn&apos;t publish a forward schedule.
        </p>
      </Card>

      <Card>
        <CardHeader title="Weekly digest" subtitle="Copy it into the group chat" />
        <div className="p-4">
          <DigestCopy lines={hub.digest} leagueName={league.name} week={hub.week} />
        </div>
      </Card>
    </div>
  );
}
