import { redirect } from "next/navigation";
import { authEnabled, getCurrentUser } from "@/lib/auth/session";
import { LiveLeague } from "@/components/LiveLeague";

export const dynamic = "force-dynamic";

export default async function LivePage({ searchParams }: { searchParams: Promise<{ league?: string; week?: string }> }) {
  if (authEnabled() && !await getCurrentUser()) redirect("/login");
  const query = await searchParams;
  return <LiveLeague key={`${query.league}:${query.week}`} initialLeague={typeof query.league === "string" ? query.league : ""} initialWeek={typeof query.week === "string" ? query.week : ""} />;
}
