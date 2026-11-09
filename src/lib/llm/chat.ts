import { prisma } from "@/lib/db";
import { formatContext, retrieve } from "@/lib/rag";
import { runTool, tools } from "@/lib/tools/registry";
import { buildSystemPrompt } from "./systemPrompt";
import { getLeagueFormat } from "@/lib/league/format";
import { chat, getDefaultProvider, type ChatMessage } from "./providers";

export interface ChatTurn {
  answer: string;
  toolTrace: { name: string; summary: string }[];
  usedProvider: string;
  contextTitles: string[];
}

const MAX_TOOL_ROUNDS = 3;

/**
 * One conversational turn: retrieve, then let the model call tools until it
 * has an answer.
 *
 * Retrieval and tools do different jobs. Retrieval front-loads likely-relevant
 * league facts so a weak model that can't call tools still answers correctly.
 * Tools let a stronger model go get exactly what it needs. Doing both means
 * the app works across the whole range of models a user might plug in.
 */
export async function runChatTurn(args: {
  leagueId: string;
  conversationId: string;
  userMessage: string;
}): Promise<ChatTurn> {
  const provider = await getDefaultProvider();
  if (!provider) {
    throw new Error("No LLM provider is configured. Add one in Settings. Groq's free tier works.");
  }

  const league = await prisma.league.findUnique({ where: { id: args.leagueId } });
  if (!league) throw new Error("No league is synced yet. Sync one in Settings first.");
  const myTeam = await prisma.team.findFirst({ where: { leagueId: args.leagueId, isMine: true } });

  const format = await getLeagueFormat(args.leagueId);
  const retrieved = await retrieve(args.leagueId, args.userMessage, { limit: 6 });

  const history = await prisma.message.findMany({
    where: { conversationId: args.conversationId },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        leagueName: league.name,
        format: format.description,
        season: league.season,
        week: league.currentWeek,
        teamCount: league.teamCount,
        myTeam: myTeam?.name,
        context: formatContext(retrieved),
      }),
    },
    ...history.map((m) => ({ role: m.role as ChatMessage["role"], content: m.content })),
    { role: "user", content: args.userMessage },
  ];

  const toolTrace: { name: string; summary: string }[] = [];
  let answer = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await chat(provider, messages, tools);

    if (response.toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
      answer = response.text.trim();
      break;
    }

    messages.push({ role: "assistant", content: response.text, toolCalls: response.toolCalls });

    for (const call of response.toolCalls) {
      const result = await runTool(call.name, call.input, { leagueId: args.leagueId });
      toolTrace.push({ name: call.name, summary: truncate(result.summary, 200) });
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: truncate(result.summary, 4000),
      });
    }
  }

  if (!answer) {
    answer =
      "I couldn't reach an answer, the model kept asking for tools without concluding. Try rephrasing, or switch to a stronger model in Settings.";
  }

  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: args.conversationId, role: "user", content: args.userMessage },
    }),
    prisma.message.create({
      data: {
        conversationId: args.conversationId,
        role: "assistant",
        content: answer,
        toolsJson: JSON.stringify(toolTrace),
      },
    }),
    prisma.conversation.update({
      where: { id: args.conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return {
    answer,
    toolTrace,
    usedProvider: `${provider.label} · ${provider.modelId}`,
    contextTitles: retrieved.map((r) => r.title),
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
