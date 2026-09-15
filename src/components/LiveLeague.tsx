"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Banner, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { parseLeagueInput } from "@/lib/live/input";
import type { LiveSnapshot } from "@/lib/live/service";

type Snapshot = LiveSnapshot & { stale: boolean };

export function LiveLeague({ initialLeague, initialWeek }: { initialLeague: string; initialWeek: string }) {
  const router = useRouter();
  const [input, setInput] = useState(initialLeague);
  const [week, setWeek] = useState(initialWeek);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initialLeague) return;
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy || document.hidden) return;
      busy = true;
      setLoading(true);
      try {
        const query = new URLSearchParams({ league: initialLeague });
        if (initialWeek) query.set("week", initialWeek);
        const response = await fetch(`/api/live?${query}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401 ? "Sign in to view this league." : "Could not refresh Sleeper data. Check the league ID or try again shortly.");
        const result = await response.json() as Snapshot;
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not refresh.");
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60_000);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [initialLeague, initialWeek, refresh]);

  const names = new Map(data?.rankings.map((team) => [team.teamId, team.name]) ?? []);
  const groups = new Map<string, LiveSnapshot["matchups"]>();
  for (const row of data?.matchups ?? []) groups.set(row.matchupId, [...groups.get(row.matchupId) ?? [], row]);

  return <div className="space-y-6">
    <section className="space-y-3 py-4">
      <Badge tone="accent">Sleeper league companion</Badge>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your league. Every score. One view.</h1>
      <p className="max-w-2xl text-[var(--muted)]">Follow matchups and compare every team using your league&apos;s actual scoring. Open any Sleeper league and share its link with your group.</p>
    </section>
    <Card className="p-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        const id = parseLeagueInput(input);
        if (!id) { setError("Enter a numeric Sleeper league ID or a sleeper.com/leagues/… URL."); return; }
        const query = new URLSearchParams({ league: id });
        if (week) query.set("week", week);
        router.push(`/live?${query}`);
      }}>
        <label className="min-w-0 flex-1 text-sm font-medium">League URL or ID
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste your Sleeper league link" required className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </label>
        <label className="text-sm font-medium">Week
          <select value={week} onChange={(event) => setWeek(event.target.value)} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
            <option value="">Current</option>
            {Array.from({ length: 18 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]">Open league</button>
      </form>
    </Card>
    {error || data?.stale ? <Banner tone="warn" title={data ? "Showing the last successful update" : "League unavailable"}>{error || "Sleeper could not be refreshed. Scores below may be out of date."}</Banner> : null}
    {loading && !data ? <p role="status" className="text-sm text-[var(--muted)]">Loading your league from Sleeper…</p> : null}
    {!data && !initialLeague ? <EmptyState title="Bring your league" body="Find the league ID in your Sleeper league URL. This view uses public league data and never changes your roster." /> : null}
    {data ? <>
      {data.fixture ? <Banner tone="warn" title="Demo fixture data">This server is running with SLEEPER_FIXTURES=1. These are test records, not live league results.</Banner> : null}
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{data.league.name}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{data.league.season} · {data.week > 0 ? `Week ${data.week}` : "Select a scoring week"} · {data.rankings.length} teams</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Fetched {new Date(data.fetchedAt).toLocaleString()} · Refreshes every minute while visible · Upstream scoring may be delayed</p>
        </div>
        <div className="flex gap-2">
          <button disabled={loading} onClick={() => setRefresh((value) => value + 1)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button>
          <button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setError("Copy the league URL from your browser to share it."); } }} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">{copied ? "Link copied" : "Copy league link"}</button>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Weekly median" value={data.scoreboard.median?.toFixed(2) ?? "—"} hint="Middle score among reported teams" />
        <Stat label="Highest score" value={data.scoreboard.teams[0]?.points.toFixed(2) ?? "—"} hint={names.get(data.scoreboard.teams[0]?.teamId ?? "") ?? "No scores reported"} />
        <Stat label="Scoring coverage" value={`${data.scoreboard.teams.length} / ${data.rankings.length}`} hint="Teams with a reported weekly score" />
      </div>
      <Card>
        <CardHeader title={`Week ${data.week} matchups`} subtitle="Actual points reported by Sleeper, including zero scores. These are not win probabilities." />
        {groups.size ? <div className="grid gap-3 p-4 sm:grid-cols-2">{[...groups].map(([id, rows]) => <div key={id} className="rounded-lg border border-[var(--border)] p-3">
          {rows.map((row) => <div key={row.platformTeamId} className="flex justify-between gap-4 py-1"><span className="text-sm">{names.get(row.platformTeamId)}</span><strong className="tabular-nums">{row.points.toFixed(2)}</strong></div>)}
          {rows.length === 1 ? <p className="mt-2 text-xs text-[var(--muted)]">Bye or unpaired matchup</p> : null}
        </div>)}</div> : <p className="p-4 text-sm text-[var(--muted)]">No matchups reported for this week. Choose a completed week for a past season.</p>}
      </Card>
      <Card>
        <CardHeader title="How your week compares" subtitle="All-play record: the wins, losses and ties each team would have against every other reported score this week." />
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-[var(--muted)]"><th className="p-3">Rank</th><th className="p-3">Team</th><th className="p-3 text-right">Points</th><th className="p-3 text-right">All-play W–L–T</th><th className="p-3 text-right">vs median</th></tr></thead>
          <tbody>{data.scoreboard.teams.map((team) => <tr key={team.teamId} className="border-t border-[var(--border-soft)]"><td className="p-3">{team.rank}</td><th className="p-3 text-left font-medium">{names.get(team.teamId)}</th><td className="p-3 text-right tabular-nums">{team.points.toFixed(2)}</td><td className="p-3 text-right tabular-nums">{team.wins}–{team.losses}–{team.ties}</td><td className="p-3 text-right tabular-nums">{(team.aboveMedian ?? 0) > 0 ? "+" : ""}{team.aboveMedian?.toFixed(2)}</td></tr>)}</tbody>
        </table></div>
        <p className="p-4 text-xs text-[var(--muted)]">Comparisons change as games progress. All-play is an analytical comparison; it does not change your league standings.</p>
      </Card>
      <Card>
        <CardHeader title="Season power rankings" subtitle="Existing Copilot model: 70% relative scoring rate, 30% record. Season totals are reported by Sleeper." />
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-[var(--muted)]"><th className="p-3">Rank</th><th className="p-3">Team</th><th className="p-3 text-right">W–L–T</th><th className="p-3 text-right">Points for</th><th className="p-3 text-right">Points against</th><th className="p-3 text-right">Power</th></tr></thead>
          <tbody>{data.rankings.map((team) => <tr key={team.teamId} className="border-t border-[var(--border-soft)]"><td className="p-3">{team.rank}</td><th className="p-3 text-left font-medium">{team.name}</th><td className="p-3 text-right tabular-nums">{team.wins}–{team.losses}–{team.ties}</td><td className="p-3 text-right tabular-nums">{team.pointsFor.toFixed(2)}</td><td className="p-3 text-right tabular-nums">{team.pointsAgainst.toFixed(2)}</td><td className="p-3 text-right tabular-nums">{team.powerScore.toFixed(1)}</td></tr>)}</tbody>
        </table></div>
      </Card>
      <p className="text-xs text-[var(--muted)]">Source: Sleeper public league API. Scores already use your league&apos;s scoring settings. Player projections and lineup advice are available in the synced league workspace.</p>
    </> : null}
  </div>;
}
