"use client";

import { useEffect, useRef, useState } from "react";
import { loadDashboard, type DashboardSnapshot } from "@/lib/live/browser";
import { parseLeagueInput } from "@/lib/live/input";
import { DashboardProfileSchema, parseProfiles, parseTeamSelection, PROFILE_STORAGE, safeAppUrl, shareQuery, type DashboardProfile } from "@/lib/live/profile";
import { discoverSleeperTeams, readBrowserPlayers } from "@/lib/platforms/browser";
import type { NormalizedPlayer } from "@/lib/platforms/types";
import { scoreShare } from "@/lib/core/live";

type FeedItem = { teamId: string; at: string; before: number; after: number };
const money = (value: number | null | undefined) => value == null ? "—" : value.toFixed(2);
const APP_FEATURES = [
  ["/lineup", "Start / sit", "Compare starters and bench options."],
  ["/waivers", "Waivers", "Find pickups and plan your bids."],
  ["/streaming", "Streaming", "Compare available weekly starters."],
  ["/chat", "Trades", "Ask Copilot to evaluate a deal for both teams."],
  ["/chat", "Ask Copilot", "Ask questions grounded in your synced league."],
  ["/settings", "MCP access", "Create or revoke a key for your MCP client."],
];

const NO_PROFILES: DashboardProfile[] = [];

export function TeamDashboard({ standalone = false, initialLeague = "", initialWeek = "", defaultProfiles = NO_PROFILES }: { standalone?: boolean; initialLeague?: string; initialWeek?: string; defaultProfiles?: DashboardProfile[] }) {
  const [ready, setReady] = useState(false);
  const [leagueId, setLeagueId] = useState(initialLeague);
  const [week, setWeek] = useState(initialWeek);
  const [input, setInput] = useState(initialLeague);
  const [profiles, setProfiles] = useState<DashboardProfile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [players, setPlayers] = useState<Record<string, NormalizedPlayer>>({});
  const [playerError, setPlayerError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState("Overview");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [appUrl, setAppUrl] = useState("");
  const [appDraft, setAppDraft] = useState("");
  const [demo, setDemo] = useState(false);
  const [username, setUsername] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const previous = useRef<DashboardSnapshot | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    let saved: DashboardProfile[] = [];
    try {
      const stored = localStorage.getItem(PROFILE_STORAGE);
      saved = stored === null ? defaultProfiles : parseProfiles(stored);
      if (stored === null) localStorage.setItem(PROFILE_STORAGE, JSON.stringify(saved));
      setProfiles(saved);
      const app = safeAppUrl(localStorage.getItem("fantasy-copilot-app") ?? "") ?? "";
      setAppUrl(app); setAppDraft(app);
    } catch { setNotice("Browser storage is unavailable. You can still share or export your dashboard."); }
    const id = parseLeagueInput(query.get("league") ?? initialLeague) ?? saved[0]?.leagueId ?? "";
    setLeagueId(id); setInput(id);
    const requestedWeek = query.get("week") ?? initialWeek;
    if (/^(?:[1-9]|1[0-8])$/.test(requestedWeek)) setWeek(requestedWeek);
    else setWeek("");
    try { setSelected(parseTeamSelection(query.get("teams")) ?? saved.find(p => p.leagueId === id)?.teamIds ?? []); }
    catch (err) { setError(err instanceof Error ? err.message : "Invalid team selection."); }
    setDemo(query.get("demo") === "1");
    setReady(true);
  }, [initialLeague, initialWeek, defaultProfiles]);

  useEffect(() => {
    if (!ready || (!leagueId && !demo)) return;
    let cancelled = false;
    let busy = false;
    async function load() {
      if (busy || document.hidden || !navigator.onLine) return;
      busy = true; setLoading(true);
      try {
        const next = demo
          ? await (await import("@/lib/live/demo")).loadDemoDashboard()
          : await loadDashboard(leagueId, week ? Number(week) : undefined);
        if (cancelled) return;
        const last = previous.current;
        if (last && last.league.platformLeagueId === next.league.platformLeagueId && last.week === next.week) {
          const changes = next.matchups.flatMap(row => {
            const before = last.matchups.find(old => old.platformTeamId === row.platformTeamId)?.points;
            return before !== undefined && before !== row.points ? [{ teamId: row.platformTeamId, at: next.fetchedAt, before, after: row.points }] : [];
          });
          if (changes.length) setFeed(items => [...changes, ...items].slice(0, 80));
        } else { setFeed([]); }
        previous.current = next; setData(next); setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not refresh Sleeper. Your last successful scores are still shown.");
      } finally { busy = false; if (!cancelled) setLoading(false); }
    }
    void load();
    const timer = paused || demo ? undefined : setInterval(() => void load(), 60_000);
    const visible = () => { if (!paused) void load(); };
    const offline = () => setError("You are offline. Scores will refresh when your connection returns.");
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible); window.addEventListener("offline", offline);
    if (!navigator.onLine) offline();
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); window.removeEventListener("offline", offline); };
  }, [ready, leagueId, week, refresh, paused, demo]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const job = demo ? import("@/lib/live/demo").then(m => m.demoPlayers()) : readBrowserPlayers();
    job.then(result => { if (!cancelled) { setPlayers(result); setPlayerError(""); } }).catch(() => {
      if (!cancelled) setPlayerError("Player names could not load. Rosters show player IDs; scores are unaffected.");
    });
    return () => { cancelled = true; };
  }, [!!data, demo]);

  function updateUrl(id: string, ids: string[], scoringWeek = week, isDemo = false) {
    const query = new URLSearchParams({ league: id, teams: ids.join(",") });
    if (scoringWeek) query.set("week", scoringWeek);
    if (isDemo) query.set("demo", "1");
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }
  function connect(id: string, ids: string[] = [], isDemo = false) {
    previous.current = null; setData(null); setFeed([]); setError(""); setPlayers({}); setPlayerError("");
    setLeagueId(id); setInput(id); setWeek(""); setSelected(ids); setDemo(isDemo); setTab("Overview");
    setRefresh(v => v + 1);
    updateUrl(id, ids, "", isDemo);
  }
  function choose(ids: string[]) { setSelected(ids); updateUrl(leagueId, ids, week, demo); }
  function persist(next: DashboardProfile[]) {
    setProfiles(next);
    try { localStorage.setItem(PROFILE_STORAGE, JSON.stringify(next)); return true; }
    catch { setNotice("Your selection works for this visit. Export it to keep a copy; browser storage is unavailable."); return false; }
  }
  function currentProfile(): DashboardProfile | null {
    if (!data || demo) return null;
    return { version: 1, platform: "sleeper", leagueId, name: data.league.name, teamIds: selected.filter(id => data.teams.some(t => t.platformTeamId === id)) };
  }
  async function copy(text: string, message: string) {
    try { await navigator.clipboard.writeText(text); setNotice(message); }
    catch { setNotice("Clipboard is unavailable. Use Export dashboard to share your configuration."); }
  }
  function exportProfile() {
    const profile = currentProfile(); if (!profile) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `sleeper-${leagueId}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const visibleTeams = data?.teams.filter(team => selected.includes(team.platformTeamId)) ?? [];
  const names = new Map(data?.teams.map(team => [team.platformTeamId, team.name]) ?? []);
  const appBase = standalone ? appUrl : "";
  const appConnected = !standalone || !!appUrl;

  return <div className="team-dashboard">
    <header className="dash-heading">
      <div><p className="dash-eyebrow">FANTASY COPILOT / SLEEPER</p><h1>Your team, in play.</h1><p className="dash-muted">Your roster. Your matchups. A dashboard you can take with you.</p></div>
      <span className={`dash-status ${demo || error || paused ? "tint-warn" : "tint-neutral"}`} role="status">{demo ? "Demo · sample data" : error ? "Refresh interrupted" : loading ? "Syncing Sleeper…" : paused ? "Refresh paused" : data ? "Auto-refresh · 60s" : "Connect your league"}</span>
    </header>

    <section className="dash-connect" aria-label="League connection">
      <form onSubmit={event => {
        event.preventDefault(); const id = parseLeagueInput(input);
        if (!id) { setError("Paste a Sleeper league URL or numeric league ID."); return; }
        connect(id, profiles.find(p => p.leagueId === id)?.teamIds ?? []);
      }}>
        <label>League URL or ID<input value={input} onChange={event => setInput(event.target.value)} placeholder="sleeper.com/leagues/…" required /></label>
        <button className="dash-primary" disabled={loading}>Connect league</button>
      </form>
      <div className="dash-actions"><button onClick={() => importInput.current?.click()}>Import dashboard</button>{!data && <button onClick={() => connect("1124839284756483920", ["1"], true)}>Explore sample dashboard</button>}</div>
      <input ref={importInput} type="file" accept=".json,application/json" hidden aria-label="Import dashboard JSON" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        try {
          if (file.size > 20_000) throw new Error("Choose a dashboard configuration smaller than 20 KB.");
          const profile = DashboardProfileSchema.parse(JSON.parse(await file.text()));
          persist([...profiles.filter(p => p.leagueId !== profile.leagueId), profile]); connect(profile.leagueId, profile.teamIds);
          setNotice(`Imported ${profile.name}. Only public league and team preferences were imported.`);
        } catch { setError("This is not a valid Sleeper dashboard configuration."); }
      }} />
    </section>

    <details className="dash-account"><summary>Sync all leagues from a Sleeper account</summary><form onSubmit={async event => {
      event.preventDefault(); setDiscovering(true);
      try {
        const account = await discoverSleeperTeams(username);
        const found = account.leagues.map(league => DashboardProfileSchema.parse({ version: 1, platform: "sleeper", ...league }));
        if (!found.length) { setNotice(`No ${account.season} football leagues found for ${account.username}. You can still connect a league link above.`); return; }
        const merged = [...profiles.filter(p => !found.some(f => f.leagueId === p.leagueId)), ...found.map(p => profiles.find(old => old.leagueId === p.leagueId) ?? p)];
        const saved = persist(merged);
        if (!leagueId || demo) connect(found[0].leagueId, found[0].teamIds);
        setNotice(`Found ${found.length} leagues for ${account.username} (${account.season}). Your own teams are selected in newly added leagues.${saved ? "" : " Browser storage is unavailable; these connections last for this visit."}`);
      } catch (err) { setNotice(err instanceof Error ? err.message : "Could not sync this Sleeper account."); }
      finally { setDiscovering(false); }
    }}><label>Sleeper username<input value={username} onChange={event => setUsername(event.target.value)} placeholder="Your Sleeper username" autoComplete="off" required /></label><button className="dash-primary" disabled={discovering}>{discovering ? "Finding your teams…" : "Sync account"}</button></form><p className="dash-fine">Adds every current-season league. Existing team choices are kept. Remove any saved connection below.</p></details>

    {!!profiles.length && <div className="dash-saved" aria-label="Saved leagues">{profiles.map(profile => <div key={profile.leagueId} className={profile.leagueId === leagueId && !demo ? "active" : ""}>
      <button onClick={() => connect(profile.leagueId, profile.teamIds)}>{profile.name}</button>
      <button aria-label={`Remove ${profile.name}`} title="Remove saved connection" onClick={() => {
        persist(profiles.filter(p => p.leagueId !== profile.leagueId));
        if (profile.leagueId === leagueId) { connect(""); window.history.replaceState(null, "", window.location.pathname); }
        setNotice("Connection removed from this browser. The Sleeper league itself is unchanged.");
      }}>×</button>
    </div>)}</div>}
    {notice && <div className="dash-banner tint-info" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    {error && <div className="dash-banner tint-warn" role="alert"><div><strong>{data ? "Showing the last successful scores. " : "Could not load the league. "}</strong>{error}</div><button onClick={() => setRefresh(v => v + 1)}>Retry</button></div>}
    {!data && <section className="dash-empty"><span className="dash-empty-mark">FC</span><h2>{loading ? "Bringing in your league…" : "Build your team’s home field."}</h2><p>Connect Sleeper, choose the teams you follow, and save your dashboard. Share a link or export it for someone else to use.</p><div className="dash-preview-labels"><span>Live matchups</span><span>Weekly lineup</span><span>Season analytics</span><span>MCP companion</span></div></section>}

    {data && <>
      {demo && <div className="dash-banner tint-warn"><div><strong>Sample dashboard.</strong> These are bundled test records, not your league or a live game. Connect your Sleeper league above.</div></div>}
      <section className="dash-league-heading"><div><h2>{data.league.name}</h2><p className="dash-muted">{data.league.season} season · {data.teams.length} teams · {data.league.isDynasty ? "Dynasty" : data.league.isKeeper ? "Keeper" : "Redraft"}</p><p className="dash-timestamp">{demo ? "Sample snapshot" : `Last successful sync ${new Date(data.fetchedAt).toLocaleTimeString()}`} · Scores follow Sleeper’s reporting delay</p></div>
        <div className="dash-actions"><label>Scoring week<select value={week} disabled={demo} onChange={event => { const value = event.target.value; setWeek(value); setData(null); setFeed([]); previous.current = null; updateUrl(leagueId, selected, value, demo); }}><option value="">Current {data.league.currentWeek > 0 ? `(${data.league.currentWeek})` : "— choose week"}</option>{Array.from({ length: 18 }, (_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}</select></label><button disabled={loading || demo} onClick={() => setRefresh(v => v + 1)}>Refresh</button><button disabled={demo} onClick={() => setPaused(v => !v)}>{paused ? "Resume" : "Pause"}</button></div>
      </section>

      <details className="dash-selection" open={!selected.length}>
        <summary>Teams to display <span>{visibleTeams.length} selected</span></summary>
        <div className="dash-team-picker">{data.teams.map(team => <label key={team.platformTeamId}><input type="checkbox" checked={selected.includes(team.platformTeamId)} onChange={event => choose(event.target.checked ? [...selected, team.platformTeamId] : selected.filter(id => id !== team.platformTeamId))} /><span>{team.name}<small>{team.ownerName}</small></span></label>)}</div>
        <div className="dash-actions"><button onClick={() => choose(data.teams.map(t => t.platformTeamId))}>Select all</button><button onClick={() => choose([])}>Clear selection</button><button className="dash-primary" disabled={demo} onClick={() => { const profile = currentProfile(); if (profile && persist([...profiles.filter(p => p.leagueId !== leagueId), profile])) setNotice("Dashboard saved on this browser. Share or export it to use on another device."); }}>Save displayed teams</button></div>
        <p className="dash-fine">These preferences control the dashboard display. MCP permissions are managed separately in the connected app.</p>
      </details>
      <div className="dash-toolbar"><nav aria-label="Dashboard views">{["Overview", "Roster", "Analytics", "Score feed", "App & MCP"].map(name => <button key={name} aria-pressed={tab === name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}</button>)}</nav><div className="dash-actions"><button disabled={demo} onClick={() => { const profile = currentProfile(); if (profile) void copy(`${window.location.origin}${window.location.pathname}?${shareQuery(profile, week)}`, "Dashboard link copied. It includes only your league, selected teams, and week."); }}>Share dashboard ↗</button><button disabled={demo} onClick={exportProfile}>Export</button></div></div>
      {!visibleTeams.length && tab !== "App & MCP" && <div className="dash-empty compact"><h2>Choose a team to get started.</h2><p>Select teams above. An empty selection keeps all team cards hidden.</p></div>}

      {tab === "Overview" && visibleTeams.length > 0 && <div className="dash-team-grid">{visibleTeams.map(team => {
        const score = data.matchups.find(m => m.platformTeamId === team.platformTeamId);
        const opponent = score && data.matchups.find(m => m.matchupId === score.matchupId && m.platformTeamId !== team.platformTeamId);
        const rank = data.rankings.find(r => r.teamId === team.platformTeamId);
        const comparison = data.scoreboard.teams.find(r => r.teamId === team.platformTeamId);
        const opponentVisible = opponent && selected.includes(opponent.platformTeamId);
        const share = score && opponent ? scoreShare(score.points, opponent.points) : null;
        return <article className="dash-team-card" key={team.platformTeamId}>
          <div className="dash-card-top"><span className="dash-monogram">{team.name.slice(0, 2).toUpperCase()}</span><div><h3>{team.name}</h3><p className="dash-muted">{team.ownerName} · {team.wins}–{team.losses}–{team.ties}</p></div><button className="dash-icon-button" aria-label={`Hide ${team.name}`} title="Hide team" onClick={() => choose(selected.filter(id => id !== team.platformTeamId))}>×</button></div>
          <div className="dash-score"><div><span>WEEK {data.week || "—"} POINTS</span><strong>{money(score?.points)}</strong></div><span className="dash-score-note">{score ? `#${comparison?.rank ?? "—"} this week` : "No weekly score reported"}</span></div>
          {opponentVisible ? <div className="dash-matchup"><div><span>{names.get(opponent.platformTeamId)}</span><strong>{money(opponent.points)}</strong></div>{share !== null && <div className="dash-comparison-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></div>}<p className="dash-fine">Actual points comparison · not a win probability</p></div> : <p className="dash-matchup dash-muted">{opponent ? "Opponent hidden — select their team to compare." : score ? "Bye or unpaired matchup" : "Choose a scoring week to see the matchup."}</p>}
          <div className="dash-card-stats"><div><span>Season power rank</span><strong>#{rank?.rank ?? "—"}</strong></div><div><span>vs weekly median</span><strong>{comparison && (comparison.aboveMedian ?? 0) > 0 ? "+" : ""}{money(comparison?.aboveMedian)}</strong></div><div><span>All-play W–L–T</span><strong>{comparison ? `${comparison.wins}–${comparison.losses}–${comparison.ties}` : "—"}</strong></div></div>
          <button className="dash-text-button" onClick={() => setTab("Roster")}>See weekly lineup →</button>
        </article>;
      })}</div>}

      {tab === "Roster" && <><p className="dash-fine">Weekly lineups come from the selected matchup week. Current roster and injury labels are identified separately.</p>{playerError && <p className="dash-banner tint-warn">{playerError}</p>}<div className="dash-roster-grid">{visibleTeams.map(team => {
        const matchup = data.matchups.find(m => m.platformTeamId === team.platformTeamId);
        const roster = data.rosters.find(r => r.platformTeamId === team.platformTeamId);
        const historical = !!matchup?.starters && !!matchup?.players;
        const starterSlots = data.league.rosterSlots.filter(s => s.isStarter);
        const spots = historical ? [
          ...matchup.starters!.map((id, i) => ({ platformPlayerId: id, slot: starterSlots[i]?.code ?? "Starter", isStarter: true })),
          ...matchup.players!.filter(id => !matchup.starters!.includes(id)).map(id => ({ platformPlayerId: id, slot: "BN", isStarter: false })),
        ] : roster?.spots ?? [];
        return <section className="dash-panel" key={team.platformTeamId}><div className="dash-panel-heading"><h3>{team.name}</h3><span className="dash-fine">{historical ? `Week ${data.week} lineup` : "Current roster · not historical"}</span></div><div className="dash-roster-list">{spots.map((spot, index) => {
          const player = players[spot.platformPlayerId];
          return <div key={`${spot.platformPlayerId}:${index}`} className={`dash-player ${!spot.isStarter ? "bench" : ""}`}><span className="dash-slot">{spot.slot}</span><div><strong>{spot.platformPlayerId === "0" ? "Empty slot" : player?.fullName ?? `Player ${spot.platformPlayerId}`}</strong><small>{player ? `${player.position ?? ""} · ${player.nflTeam ?? "Free agent"}` : "Player details unavailable"}</small></div>{player?.injuryStatus && <span className="dash-injury tint-warn">{player.injuryStatus} · now</span>}</div>;
        })}{!spots.length && <p className="dash-muted">No roster reported.</p>}</div></section>;
      })}</div></>}

      {tab === "Analytics" && visibleTeams.length > 0 && <div className="dash-panel"><div className="dash-panel-heading"><h3>Your teams, in context</h3><span className="dash-fine">Week {data.week || "—"} median: {money(data.scoreboard.median)}</span></div><div className="dash-table-wrap"><table><thead><tr><th>Team</th><th>Record</th><th>Points for</th><th>Points against</th><th>Power rank</th><th>All-play W–L–T</th><th>vs median</th></tr></thead><tbody>{data.rankings.filter(t => selected.includes(t.teamId)).map(team => {
        const comparison = data.scoreboard.teams.find(t => t.teamId === team.teamId);
        return <tr key={team.teamId}><th>{team.name}</th><td>{team.wins}–{team.losses}–{team.ties}</td><td>{money(team.pointsFor)}</td><td>{money(team.pointsAgainst)}</td><td>#{team.rank}<div className="dash-power-track" aria-label={`Power score ${team.powerScore} of 100`}><span style={{ width: `${team.powerScore}%` }} /></div></td><td>{comparison ? `${comparison.wins}–${comparison.losses}–${comparison.ties}` : "—"}</td><td>{money(comparison?.aboveMedian)}</td></tr>;
      })}</tbody></table></div><p className="dash-panel-note">Rank and median use the entire league for context. All-play compares each team’s score with every other reported score this week. Season power blends relative scoring rate (70%) and record (30%); it is not a forecast.</p></div>}

      {tab === "Score feed" && visibleTeams.length > 0 && <section className="dash-panel"><div className="dash-panel-heading"><h3>Score changes</h3><span className="dash-fine">Observed during this visit</span></div>{feed.filter(item => selected.includes(item.teamId)).length ? <ol className="dash-feed">{feed.filter(item => selected.includes(item.teamId)).map((item, i) => <li key={`${item.at}:${item.teamId}:${i}`}><time>{new Date(item.at).toLocaleTimeString()}</time><strong>{names.get(item.teamId)}</strong><span>{money(item.before)} → {money(item.after)}</span><span className={item.after >= item.before ? "tint-good" : "tint-warn"}>{item.after >= item.before ? "+" : ""}{money(item.after - item.before)}</span></li>)}</ol> : <div className="dash-empty compact"><h3>Waiting for the next score change.</h3><p>Keep this dashboard open during games. Changes appear after each successful refresh, including scoring corrections. This is a score feed, not play-by-play.</p></div>}</section>}

      {tab === "App & MCP" && <section className="dash-panel"><div className="dash-panel-heading"><h3>Your dashboard + the full app</h3><span className="dash-fine">Shareable preferences · removable connections</span></div><div className="dash-integration"><p>The dashboard follows public Sleeper data. Your running Fantasy Copilot app provides chat, projections, waivers, trades, and MCP access. Sync the same league and choose your team in that app’s Settings.</p>{standalone && <form onSubmit={event => {
        event.preventDefault(); const value = safeAppUrl(appDraft); if (!value) { setNotice("Enter the HTTPS URL of your published Fantasy Copilot app."); return; }
        setAppUrl(value); try { localStorage.setItem("fantasy-copilot-app", value); } catch { /* Works for this visit. */ } setNotice("App link saved on this browser. Sign in and sync this league in the app before using its analytics.");
      }}><label>Published app URL<input type="url" placeholder="https://your-app.replit.app" value={appDraft} onChange={event => setAppDraft(event.target.value)} /></label><button className="dash-primary">Connect app link</button>{appUrl && <button type="button" onClick={() => { setAppUrl(""); setAppDraft(""); try { localStorage.removeItem("fantasy-copilot-app"); } catch {} }}>Remove app link</button>}</form>}
        <div className="dash-feature-grid">{APP_FEATURES.map(([path, title, description]) => appConnected ? <a href={`${appBase}${path}`} target={standalone ? "_blank" : undefined} rel="noreferrer" key={title}><strong>{title} ↗</strong><span>{description}</span></a> : <div key={title}><strong>{title}</strong><span>{description}</span><small>Connect your published app to open</small></div>)}</div>
        <h3>Use this view with MCP</h3><p>Export your dashboard to give someone your league and selected-team preferences. Copy the context below into your MCP client to request the same live view. Each person creates their own app key; dashboard exports contain no keys.</p><button disabled={demo || !selected.length} onClick={() => void copy(`Use get_live_dashboard for my synced Sleeper league ${leagueId}, with team_ids "${selected.join(",")}"${week ? ` and week "${week}"` : ""}. Show only these teams. If the synced league differs, ask me to sync this league first.`, "MCP request copied. The app must be running the dashboard update and have this league synced.")}>Copy MCP request</button><p className="dash-fine">The plugin package lives in the GitHub repository. A public marketplace listing is a separate release. Removing a dashboard here removes its local preferences; revoke an app key in Settings to remove MCP access.</p>
      </div></section>}
    </>}
    <footer className="dash-footer"><span>Read-only Sleeper sync · Your roster stays in your control</span><a href="https://github.com/nsirivolu27/fantasy-copilot" target="_blank" rel="noreferrer">Source & plugin ↗</a></footer>
  </div>;
}
