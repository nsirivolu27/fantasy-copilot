import { TeamDashboard } from "@/components/TeamDashboard";
import config from "../config.json";
import { DashboardProfileSchema } from "@/lib/live/profile";

export default function Page() { return <TeamDashboard standalone defaultProfiles={config.profiles.map(p => DashboardProfileSchema.parse(p))} />; }
