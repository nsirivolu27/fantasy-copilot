import { prisma } from "@/lib/db";
import type { FantasyTool } from "@/lib/tools/registry";

/**
 * A tiny LLM client written against fetch, no SDK, no dependencies.
 *
 * Nearly every provider speaks the OpenAI chat-completions wire format, so
 * "openai-compatible" plus a base URL covers Groq, OpenRouter, Together,
 * DeepSeek, Mistral, xAI, Ollama, LM Studio and vLLM. Anthropic uses its own
 * request and tool shape, so it gets a second branch.
 *
 * Providers are database rows, so users add one in Settings without a code
 * change or a redeploy.
 */

export type ProviderKind = "openai-compatible" | "anthropic";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Present on assistant turns that requested tools. */
  toolCalls?: ToolCall[];
  /** Present on tool results. */
  toolCallId?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ProviderConfig {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string | null;
  modelId: string;
  supportsTools: boolean;
}

/** Presets shown in Settings. Users enable one by pasting a key. */
export const PROVIDER_PRESETS = [
  {
    label: "Groq",
    kind: "openai-compatible" as const,
    baseUrl: "https://api.groq.com/openai/v1",
    modelId: "llama-3.3-70b-versatile",
    note: "Free tier, very fast, good tool calling. Recommended starting point.",
    needsKey: true,
  },
  {
    label: "OpenRouter",
    kind: "openai-compatible" as const,
    baseUrl: "https://openrouter.ai/api/v1",
    modelId: "meta-llama/llama-3.3-70b-instruct",
    note: "One key, hundreds of models, some free.",
    needsKey: true,
  },
  {
    label: "Ollama (local)",
    kind: "openai-compatible" as const,
    baseUrl: "http://localhost:11434/v1",
    modelId: "llama3.1",
    note: "Runs on your machine. No key, no cost, fully private.",
    needsKey: false,
  },
  {
    label: "OpenAI",
    kind: "openai-compatible" as const,
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4o-mini",
    note: "Baseline.",
    needsKey: true,
  },
  {
    label: "Anthropic",
    kind: "anthropic" as const,
    baseUrl: "https://api.anthropic.com/v1",
    modelId: "claude-sonnet-4-20250514",
    note: "Strongest reasoning for trade analysis later.",
    needsKey: true,
  },
];

export async function getDefaultProvider(): Promise<ProviderConfig | null> {
  const row =
    (await prisma.llmProvider.findFirst({ where: { isDefault: true } })) ??
    (await prisma.llmProvider.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    kind: row.kind as ProviderKind,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    modelId: row.modelId,
    supportsTools: row.supportsTools,
  };
}

/** Converts the registry's tools into the provider's function-calling shape. */
function toolsForProvider(kind: ProviderKind, list: FantasyTool[]) {
  if (kind === "anthropic") {
    return list.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }
  return list.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

export async function chat(
  provider: ProviderConfig,
  messages: ChatMessage[],
  availableTools: FantasyTool[],
  options: { timeoutMs?: number } = {},
): Promise<ChatResponse> {
  const useTools = provider.supportsTools && availableTools.length > 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);

  try {
    return provider.kind === "anthropic"
      ? await callAnthropic(provider, messages, useTools ? availableTools : [], controller.signal)
      : await callOpenAiCompatible(provider, messages, useTools ? availableTools : [], controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiCompatible(
  provider: ProviderConfig,
  messages: ChatMessage[],
  toolList: FantasyTool[],
  signal: AbortSignal,
): Promise<ChatResponse> {
  const body: Record<string, unknown> = {
    model: provider.modelId,
    messages: messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    }),
    temperature: 0.3,
  };
  if (toolList.length) body.tools = toolsForProvider("openai-compatible", toolList);

  const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(await describeFailure(res));

  const json = await res.json();
  const choice = json?.choices?.[0]?.message ?? {};
  const rawCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];

  return {
    text: typeof choice.content === "string" ? choice.content : "",
    toolCalls: rawCalls.map((c: Record<string, never>, i: number) => {
      const fn = (c as Record<string, { name?: string; arguments?: string }>).function ?? {};
      return {
        id: (c as unknown as { id?: string }).id ?? `call_${i}`,
        name: fn.name ?? "",
        input: safeParseArgs(fn.arguments),
      };
    }),
    usage: {
      inputTokens: json?.usage?.prompt_tokens,
      outputTokens: json?.usage?.completion_tokens,
    },
  };
}

async function callAnthropic(
  provider: ProviderConfig,
  messages: ChatMessage[],
  toolList: FantasyTool[],
  signal: AbortSignal,
): Promise<ChatResponse> {
  // Anthropic takes the system prompt as a top-level field, not a message.
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: provider.modelId,
    max_tokens: 2048,
    system: system || undefined,
    messages: rest.map((m) => {
      if (m.role === "tool") {
        return {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
        };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: [
            ...(m.content ? [{ type: "text", text: m.content }] : []),
            ...m.toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
          ],
        };
      }
      return { role: m.role, content: m.content };
    }),
  };
  if (toolList.length) body.tools = toolsForProvider("anthropic", toolList);

  const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(provider.apiKey ? { "x-api-key": provider.apiKey } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(await describeFailure(res));

  const json = await res.json();
  const blocks = Array.isArray(json?.content) ? json.content : [];
  return {
    text: blocks
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join(""),
    toolCalls: blocks
      .filter((b: { type?: string }) => b.type === "tool_use")
      .map((b: { id?: string; name?: string; input?: Record<string, unknown> }) => ({
        id: b.id ?? "call",
        name: b.name ?? "",
        input: b.input ?? {},
      })),
    usage: { inputTokens: json?.usage?.input_tokens, outputTokens: json?.usage?.output_tokens },
  };
}

function safeParseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Small models sometimes emit malformed JSON. An empty object lets the tool
    // fall back to its defaults rather than crashing the whole turn.
    return {};
  }
}

/** Turns an HTTP failure into something a user can act on, without leaking the key. */
async function describeFailure(res: Response): Promise<string> {
  let detail = "";
  try {
    const text = await res.text();
    detail = text.slice(0, 300);
  } catch {
    // ignore
  }
  if (res.status === 401 || res.status === 403) return "The API key was rejected (401/403). Check it in Settings.";
  if (res.status === 404) return "The model or base URL wasn't found (404). Check the model ID and base URL.";
  if (res.status === 429) return "Rate limited by the provider (429). Wait a moment and try again.";
  if (res.status >= 500) return `The provider returned ${res.status}. That's on their side, try again shortly.`;
  return `Provider returned ${res.status}. ${detail}`;
}
