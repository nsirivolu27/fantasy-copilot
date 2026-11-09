import type { Metadata } from "next";
import "../../src/app/globals.css";
import "@/components/TeamDashboard.css";

export const metadata: Metadata = {
  title: "Fantasy Copilot · Your teams, live",
  description: "Connect a Sleeper league, follow your teams, and share your live fantasy dashboard.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><main className="dashboard-shell">{children}</main></body></html>;
}
