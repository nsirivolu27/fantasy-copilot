import Link from "next/link";
import { prisma } from "@/lib/db";
import { getActiveLeague } from "@/lib/settings";
import { getLeagueIndex } from "@/lib/rag";
import { tools } from "@/lib/tools/registry";
import { Banner } from "@/components/ui";
import { Chat } from "@/components/Chat";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const league = await getActiveLeague();
  const provider = await prisma.llmProvider.findFirst({
    where: { isDefault: true },
    select: { label: true, modelId: true },
  });
  const fallbackProvider = provider
    ? null
    : await prisma.llmProvider.findFirst({ select: { label: true, modelId: true } });
  const active = provider ?? fallbackProvider;

  const indexed = league ? (await getLeagueIndex(league.id)).documents.length : 0;
  const ready = Boolean(league && active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">League chat</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {active ? `${active.label} · ${active.modelId}` : "No model configured"} ·{" "}
          {indexed} documents indexed · {tools.length} tools
        </p>
      </div>

      {!league ? (
        <Banner tone="warn" title="No league synced">
          <Link href="/settings" className="underline">
            Sync a league in Settings
          </Link>{" "}
          and the chat will have something to talk about.
        </Banner>
      ) : null}

      {league && !active ? (
        <Banner tone="warn" title="No model configured">
          Add a provider in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          . Groq&apos;s free tier works and takes about a minute to set up.
        </Banner>
      ) : null}

      <Chat ready={ready} />
    </div>
  );
}
