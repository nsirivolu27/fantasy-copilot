import { prisma } from "@/lib/db";
import { getActiveLeague } from "@/lib/settings";
import { setMyTeamAction } from "@/app/actions";
import { Badge, Banner, Card, CardHeader, Stat } from "@/components/ui";
import { SyncForm } from "@/components/SyncForm";
import { ProviderSettings } from "@/components/ProviderSettings";
import { ProjectionForm } from "@/components/ProjectionForm";
import { McpSettings } from "@/components/McpSettings";
import { parseJson } from "@/lib/json";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const league = await getActiveLeague();
  const teams = league
    ? await prisma.team.findMany({
        where: { leagueId: league.id },
        orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
      })
    : [];

  const apiKeys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  const keyRows = apiKeys.map((k) => ({
    id: k.id,
    label: k.label,
    prefix: k.prefix,
    scopes: parseJson<string[]>(k.scopesJson, []),
    lastUsedAt: k.lastUsedAt,
    revokedAt: k.revokedAt,
    createdAt: k.createdAt,
  }));

  const statusTone =
    league?.syncStatus === "ok" ? "success" : league?.syncStatus === "stale" ? "warn" : "info";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Connect your league and pick which team is yours.
        </p>
      </div>

      <Card>
        <CardHeader title="Connect a league" subtitle="Sleeper needs no credentials" />
        <div className="p-4">
          <SyncForm defaultLeagueId={league?.platformLeagueId} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Sync status"
          right={
            league ? (
              <Badge
                className={
                  league.syncStatus === "ok"
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                    : league.syncStatus === "stale"
                      ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                      : "bg-white/5 text-[var(--muted)] ring-white/10"
                }
              >
                {league.syncStatus}
              </Badge>
            ) : undefined
          }
        />
        <div className="p-3">
          {!league ? (
            <p className="px-1 text-sm text-[var(--muted)]">
              Nothing synced yet. Enter a league ID above to get started.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="League" value={league.name} />
                <Stat label="Season" value={league.season} />
                <Stat label="Week" value={league.currentWeek || "—"} />
                <Stat label="Teams" value={league.teamCount} />
              </div>
              <p className="text-xs text-[var(--muted)]">
                Last synced:{" "}
                {league.lastSyncedAt ? league.lastSyncedAt.toLocaleString() : "never"}
              </p>
              {league.syncStatus === "stale" && league.lastSyncError ? (
                <Banner tone={statusTone} title="Last sync attempt failed">
                  {league.lastSyncError} The data shown across the app is the last good copy.
                </Banner>
              ) : null}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Which team is yours?" subtitle="Used by every later phase" />
        <div className="p-3">
          {teams.length === 0 ? (
            <p className="px-1 text-sm text-[var(--muted)]">
              Sync a league first and your teams will show up here.
            </p>
          ) : (
            <ul className="space-y-1">
              {teams.map((t) => (
                <li key={t.id}>
                  <form action={setMyTeamAction}>
                    <input type="hidden" name="teamId" value={t.id} />
                    <button
                      type="submit"
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:bg-white/[0.03] ${
                        t.isMine
                          ? "border-[var(--accent)]/50 bg-[var(--accent)]/5"
                          : "border-[var(--border)]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                          t.isMine
                            ? "border-[var(--accent)] bg-[var(--accent)]"
                            : "border-[var(--border)]"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.name}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">
                          {t.ownerName ?? "Unknown manager"} · {t.wins}-{t.losses}
                          {t.ties ? `-${t.ties}` : ""}
                        </span>
                      </span>
                      {t.isMine ? (
                        <Badge className="bg-[var(--accent)]/15 text-[var(--accent)] ring-[var(--accent)]/30">
                          Mine
                        </Badge>
                      ) : null}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Projections" subtitle="Free nflverse data — no key required" />
        <div className="p-4">
          <ProjectionForm />
        </div>
      </Card>

      <ProviderSettings />

      <McpSettings keys={keyRows} baseUrl={process.env.APP_URL ?? "http://localhost:3000"} />

      <Card>
        <CardHeader title="How this works" />
        <div className="space-y-2 p-4 text-sm text-[var(--muted)]">
          <p>
            Sleeper&apos;s read API is public: no account, password, or API key. The app calls it
            server-side only, so nothing about your league leaves your machine except the requests to
            Sleeper itself.
          </p>
          <p>
            Season, week, team count, scoring rules and roster slots all come from your league. None
            of them are hardcoded, so any format works — half-PPR, superflex, dynasty.
          </p>
          <p>
            The ~5MB player dictionary is cached and refreshed at most once every 24 hours. If it
            can&apos;t be fetched, rosters still render using player IDs.
          </p>
        </div>
      </Card>
    </div>
  );
}
