import { prisma } from "@/lib/db";
import { getActiveLeague } from "@/lib/settings";
import { MODEL_VERSION } from "@/lib/projections/model";
import { Banner, Card, CardHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The model report card. These numbers come from scripts/backtest.mjs run
 * against the real 2024 nflverse season, including the parts that don't
 * flatter the model.
 */
const BACKTEST = {
  season: "2024",
  weeks: "5-17",
  playerWeeks: 3415,
  scoring: "full PPR",
  rows: [
    { position: "QB", model: 5.98, lastWeek: 7.47, seasonAvg: 6.14 },
    { position: "RB", model: 4.97, lastWeek: 5.98, seasonAvg: 5.0 },
    { position: "WR", model: 5.03, lastWeek: 6.41, seasonAvg: 5.03 },
    { position: "TE", model: 3.96, lastWeek: 5.17, seasonAvg: 3.98 },
    { position: "All", model: 4.9, lastWeek: 6.17, seasonAvg: 4.94 },
  ],
};

export default async function ModelPage() {
  const league = await getActiveLeague();
  const count = league
    ? await prisma.projection.count({ where: { leagueId: league.id } })
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Model report card</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          What the projections are actually worth, measured against real data.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Version" value={MODEL_VERSION} />
        <Stat label="Backtest" value={`${BACKTEST.season} wk ${BACKTEST.weeks}`} />
        <Stat label="Player-weeks" value={BACKTEST.playerWeeks.toLocaleString()} />
        <Stat label="Stored projections" value={count} />
      </div>

      <Card>
        <CardHeader
          title="Mean absolute error, fantasy points per game"
          subtitle="Lower is better. Measured on the real 2024 season in full PPR."
        />
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="pb-2 pr-3 font-medium">Position</th>
                <th className="pb-2 pr-3 text-right font-medium">This model</th>
                <th className="pb-2 pr-3 text-right font-medium">Last week</th>
                <th className="pb-2 text-right font-medium">Season avg</th>
              </tr>
            </thead>
            <tbody>
              {BACKTEST.rows.map((r) => {
                const best = Math.min(r.model, r.lastWeek, r.seasonAvg);
                const cell = (v: number) =>
                  `py-1.5 text-right tabular-nums ${v === best ? "font-semibold text-[var(--good-fg)]" : ""}`;
                return (
                  <tr key={r.position} className="border-t border-[var(--border-soft)]">
                    <td className="py-1.5 pr-3 font-medium">{r.position}</td>
                    <td className={cell(r.model) + " pr-3"}>{r.model.toFixed(2)}</td>
                    <td className={cell(r.lastWeek) + " pr-3"}>{r.lastWeek.toFixed(2)}</td>
                    <td className={cell(r.seasonAvg)}>{r.seasonAvg.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Banner tone="warn" title="Read this before trusting a projection">
        <p className="mt-1">
          The model beats both baselines at every position, but by <strong>0.7% overall</strong>,
          and only 2.6% at QB. That is a small edge, and it is the honest number.
        </p>
        <p className="mt-2">
          Weekly fantasy scoring is mostly noise. A player&apos;s season average is a genuinely hard
          baseline to beat, and no amount of tuning a four-game weighted average changes that. Treat
          the point estimate as a commodity, and pay attention to the floor, ceiling and confidence
          instead, they carry more decision-relevant information than the median does.
        </p>
        <p className="mt-2">
          This is why the roadmap puts the real effort into <strong>decision leverage</strong>:
          ranking choices by how much they change your odds of winning, not by projected points.
        </p>
      </Banner>

      <Card>
        <CardHeader title="How the projection is built" />
        <ol className="list-inside list-decimal space-y-1.5 p-4 text-sm text-[var(--muted)]">
          <li>Every past game is scored with your league&apos;s own settings, so format never matters.</li>
          <li>
            Season-to-date average anchors the estimate, the baseline that is hard to beat is used
            as the base, not the thing to beat.
          </li>
          <li>
            An opportunity estimate (recency-weighted usage × season-long efficiency) is blended in,
            weighted per position by what actually helped in the backtest: QB 80%, RB 40%, TE 30%,
            WR 20%.
          </li>
          <li>Injury designations gate the projection; Out and IR project zero, Questionable takes 15% off.</li>
          <li>Floor and ceiling come from the player&apos;s own 20th/80th percentile spread.</li>
          <li>
            Confidence combines sample size and role stability, a steady 10-touch back scores higher
            than one alternating 2 and 18.
          </li>
        </ol>
      </Card>

      <Card>
        <CardHeader title="Reproduce it yourself" />
        <div className="space-y-2 p-4 text-sm text-[var(--muted)]">
          <p>Nothing here is a claim you have to take on faith:</p>
          <pre className="overflow-x-auto rounded-lg bg-[var(--panel-2)] p-3 font-mono text-xs">
{`curl -L -o player_stats_2024.csv \\
  https://github.com/nflverse/nflverse-data/releases/download/\\
player_stats/player_stats_2024.csv

node --experimental-strip-types scripts/backtest.mjs 2024`}
          </pre>
        </div>
      </Card>
    </div>
  );
}
