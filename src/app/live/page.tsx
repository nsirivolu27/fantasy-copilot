import { redirect } from "next/navigation";
import { authEnabled, getCurrentUser } from "@/lib/auth/session";
import { TeamDashboard } from "@/components/TeamDashboard";
import "@/components/TeamDashboard.css";

export const dynamic = "force-dynamic";

export default async function LivePage({ searchParams }: { searchParams: Promise<{ league?: string; week?: string }> }) {
  if (authEnabled() && !await getCurrentUser()) redirect("/login");
  const query = await searchParams;
  return <TeamDashboard key={`${query.league}:${query.week}`} initialLeague={typeof query.league === "string" ? query.league : ""} initialWeek={typeof query.week === "string" ? query.week : ""} />;
}
