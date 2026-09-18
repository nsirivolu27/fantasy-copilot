import { NextResponse } from "next/server";
import { authEnabled, getCurrentUser } from "@/lib/auth/session";
import { parseLeagueInput } from "@/lib/live/input";
import { getLiveSnapshot } from "@/lib/live/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (authEnabled() && !await getCurrentUser()) return NextResponse.json({ error: "Sign in to view this league." }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const id = parseLeagueInput(query.get("league") ?? "");
  const weekValue = query.get("week");
  const week = weekValue === null ? undefined : Number(weekValue);
  if (!id || (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18))) {
    return NextResponse.json({ error: "Enter a Sleeper league ID or league URL, and a week from 1 to 18." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getLiveSnapshot(id, week), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load this league from Sleeper. Check its ID and try again shortly." }, { status: 502 });
  }
}
