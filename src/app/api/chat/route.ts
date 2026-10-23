import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveLeague } from "@/lib/settings";
import { runChatTurn } from "@/lib/llm/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { message?: string; conversationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a JSON body." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: "Message is empty." }, { status: 400 });
  }

  const league = await getActiveLeague();
  if (!league) {
    return NextResponse.json(
      { ok: false, error: "No league is synced yet. Sync one in Settings first." },
      { status: 400 },
    );
  }

  // Reuse the conversation if given, otherwise start one.
  let conversationId = body.conversationId ?? "";
  if (conversationId) {
    const exists = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!exists) conversationId = "";
  }
  if (!conversationId) {
    const created = await prisma.conversation.create({
      data: { leagueId: league.id, title: message.slice(0, 60) },
    });
    conversationId = created.id;
  }

  try {
    const turn = await runChatTurn({
      leagueId: league.id,
      conversationId,
      userMessage: message,
    });
    return NextResponse.json({ ok: true, conversationId, ...turn });
  } catch (err) {
    const error = err instanceof Error ? err.message : "The chat request failed.";
    console.error("[api/chat]", error);
    return NextResponse.json({ ok: false, error, conversationId }, { status: 500 });
  }
}
