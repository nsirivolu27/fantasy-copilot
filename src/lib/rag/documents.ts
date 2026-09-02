import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getSportModule } from "@/lib/sports";
import type { NormalizedSlot } from "@/lib/platforms/types";
import type { RagDocument } from "./bm25";

/**
 * Turns the synced league into retrievable documents.
 *
 * One document per fact-cluster a question is likely to be about: the league
 * itself, its scoring, each team, each team's roster, and each rostered
 * player. Text is written the way someone would ask about it, so the lexical
 * index matches naturally ("who has Bucky Irving", "what's the FAAB budget").
 *
 * Everything here is derived from synced data. Nothing is invented.
 */
export async function buildLeagueDocuments(leagueId: string): Promise<RagDocument[]> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return [];

  const sport = getSportModule(league.sport);
  const scoring = parseJson<Record<string, number>>(league.scoringSettingsJson, {});
  const slots = parseJson<NormalizedSlot[]>(league.rosterSlotsJson, []);

  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
    include: { rosterSpots: { include: { player: true }, orderBy: { slotIndex: "asc" } } },
  });

  const docs: RagDocument[] = [];
  const starters = slots.filter((s) => s.isStarter).map((s) => sport.slotLabel(s.code));
  const bench = slots.filter((s) => !s.isStarter).map((s) => sport.slotLabel(s.code));

  docs.push({
    id: `league:${league.id}`,
    kind: "league",
    title: `League: ${league.name}`,
    text: [
      `${league.name} is a ${league.teamCount}-team ${league.sport} league on ${league.platform}.`,
      `Season ${league.season}, currently week ${league.currentWeek}.`,
      league.isDynasty ? "It is a dynasty league." : league.isKeeper ? "It is a keeper league." : "It is a redraft league.",
      league.waiverType === "faab"
        ? `Waivers use FAAB with a $${league.waiverBudget ?? 0} budget per team.`
        : "Waivers use rolling priority order.",
      `Starting lineup slots: ${starters.join(", ")}.`,
      `Bench and reserve slots: ${bench.join(", ") || "none"}.`,
      `Last synced ${league.lastSyncedAt?.toISOString() ?? "never"}.`,
    ].join(" "),
    meta: { leagueId: league.id },
  });

  const scoringLines = Object.entries(scoring)
    .map(([key, value]) => `${sport.scoringLabel(key)} (${key}): ${value} points`)
    .join("; ");
  docs.push({
    id: `scoring:${league.id}`,
    kind: "scoring",
    title: `Scoring settings for ${league.name}`,
    text: `Scoring rules, points per stat. ${scoringLines}. ${
      scoring.rec === 1 ? "This is a full PPR league (1 point per reception)." : ""
    }${scoring.rec === 0.5 ? "This is a half-PPR league (0.5 points per reception)." : ""}${
      !scoring.rec ? "Receptions score no points (standard scoring)." : ""
    }`,
    meta: { leagueId: league.id },
  });

  for (const team of teams) {
    const record = `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`;
    const startersList = team.rosterSpots.filter((s) => s.isStarter);
    const benchList = team.rosterSpots.filter((s) => !s.isStarter);

    docs.push({
      id: `team:${team.id}`,
      kind: "team",
      title: `Team: ${team.name}`,
      text: [
        `${team.name} is managed by ${team.ownerName ?? "an unknown manager"}.`,
        `Record ${record}, ${team.pointsFor.toFixed(2)} points for, ${team.pointsAgainst.toFixed(2)} points against.`,
        team.isMine ? "This is the user's own team." : "",
        team.waiverBudgetUsed != null && league.waiverBudget
          ? `Has spent $${team.waiverBudgetUsed} of $${league.waiverBudget} FAAB, leaving $${league.waiverBudget - team.waiverBudgetUsed}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      meta: { teamId: team.id, isMine: team.isMine },
    });

    docs.push({
      id: `roster:${team.id}`,
      kind: "roster",
      title: `Roster: ${team.name}`,
      text: [
        `${team.name} roster.`,
        `Starters: ${
          startersList
            .map((s) => `${sport.slotLabel(s.slot)} ${s.player.fullName} (${s.player.position ?? "?"}, ${s.player.nflTeam ?? "FA"})`)
            .join("; ") || "none set"
        }.`,
        `Bench: ${
          benchList.map((s) => `${s.player.fullName} (${s.player.position ?? "?"})`).join("; ") || "empty"
        }.`,
      ].join(" "),
      meta: { teamId: team.id, isMine: team.isMine },
    });
  }

  // One document per rostered player, so "who has X" and "is X hurt" both hit.
  const spots = teams.flatMap((t) => t.rosterSpots.map((s) => ({ team: t, spot: s })));
  const seen = new Set<string>();
  for (const { team, spot } of spots) {
    if (seen.has(spot.player.id)) continue;
    seen.add(spot.player.id);
    const p = spot.player;
    docs.push({
      id: `player:${p.id}`,
      kind: "player",
      title: `Player: ${p.fullName}`,
      text: [
        `${p.fullName} is a ${p.position ?? "player"} for ${p.nflTeam ?? "no NFL team"}.`,
        `Rostered by ${team.name} in the ${spot.isStarter ? `starting ${sport.slotLabel(spot.slot)} slot` : "bench or reserve"}.`,
        p.injuryStatus ? `Injury status: ${p.injuryStatus}.` : "No injury designation.",
        p.age ? `Age ${p.age}.` : "",
        p.yearsExp != null ? `${p.yearsExp} years experience.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      meta: { playerId: p.id, teamId: team.id },
    });
  }

  return docs;
}
