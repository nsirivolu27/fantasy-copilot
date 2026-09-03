import { prisma } from "@/lib/db";
import { PROVIDER_PRESETS } from "@/lib/llm/providers";
import {
  deleteProviderAction,
  saveProviderAction,
  setDefaultProviderAction,
  testProviderAction,
} from "@/app/actions";
import { Badge, Card, CardHeader } from "@/components/ui";

/**
 * Providers are database rows, so adding one never needs a redeploy.
 * Keys are written to the database and never sent back to the browser — this
 * component only ever renders whether a key exists.
 */
export async function ProviderSettings() {
  const providers = await prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <Card>
      <CardHeader
        title="AI model"
        subtitle="Any provider. Bring your own key — or run one locally for free."
      />
      <div className="space-y-4 p-4">
        {providers.length > 0 ? (
          <ul className="space-y-2">
            {providers.map((p) => (
              <li key={p.id} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{p.label}</span>
                      {p.isDefault ? (
                        <Badge tone="accent">
                          Default
                        </Badge>
                      ) : null}
                      {p.lastTestOk === true ? (
                        <Badge tone="good">
                          Working
                        </Badge>
                      ) : p.lastTestOk === false ? (
                        <Badge tone="bad">Failed</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--muted)]">
                      {p.modelId} · {p.baseUrl}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {p.apiKey ? "Key stored" : "No key (local model)"}
                      {p.lastTestNote ? ` · ${p.lastTestNote}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <form action={testProviderAction}>
                    <input type="hidden" name="providerId" value={p.id} />
                    <button className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs transition hoverable">
                      Test connection
                    </button>
                  </form>
                  {!p.isDefault ? (
                    <form action={setDefaultProviderAction}>
                      <input type="hidden" name="providerId" value={p.id} />
                      <button className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs transition hoverable">
                        Make default
                      </button>
                    </form>
                  ) : null}
                  <form action={deleteProviderAction}>
                    <input type="hidden" name="providerId" value={p.id} />
                    <button className="rounded-md border tint-bad px-2.5 py-1 text-xs text-[var(--bad-fg)] transition hover:brightness-95">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            No model yet. Groq has a free tier and takes about a minute — pick it below, paste a key
            from console.groq.com, and save.
          </p>
        )}

        <details className="rounded-lg border border-[var(--border)]">
          <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
            Add a provider
          </summary>
          <div className="border-t border-[var(--border)] p-3">
            <div className="mb-3 grid gap-1.5 text-xs text-[var(--muted)]">
              {PROVIDER_PRESETS.map((preset) => (
                <p key={preset.label}>
                  <span className="font-medium text-[var(--text)]">{preset.label}</span> —{" "}
                  {preset.note}{" "}
                  <span className="font-mono">{preset.baseUrl}</span>
                </p>
              ))}
            </div>

            <form action={saveProviderAction} className="space-y-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <input
                  name="label"
                  required
                  placeholder="Label (e.g. Groq)"
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
                <select
                  name="kind"
                  defaultValue="openai-compatible"
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="openai-compatible">OpenAI-compatible (most providers)</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>
              <input
                name="baseUrl"
                required
                placeholder="https://api.groq.com/openai/v1"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
              />
              <input
                name="modelId"
                required
                placeholder="llama-3.3-70b-versatile"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
              />
              <input
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder="API key (leave blank for a local model)"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
              />
              <button className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] sm:w-auto">
                Save provider
              </button>
            </form>
          </div>
        </details>
      </div>
    </Card>
  );
}
