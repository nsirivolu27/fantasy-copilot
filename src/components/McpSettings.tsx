"use client";

import { useActionState } from "react";
import { createApiKeyAction, revokeApiKeyAction, type ApiKeyFormState } from "@/app/actions";
import { Badge, Banner, Card, CardHeader } from "@/components/ui";

interface KeyRow {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const SCOPES = [
  { id: "read:league", label: "Read league", hint: "Settings, teams, rosters" },
  { id: "read:projections", label: "Read projections", hint: "Weekly projections" },
  { id: "read:trades", label: "Read trades", hint: "Trade evaluation and suggestions" },
];

export function McpSettings({ keys, baseUrl }: { keys: KeyRow[]; baseUrl: string }) {
  const [state, action] = useActionState<ApiKeyFormState, FormData>(createApiKeyAction, {
    status: "idle",
  });

  const configSnippet = `{
  "mcpServers": {
    "fantasy-copilot": {
      "url": "${baseUrl}/api/mcp",
      "headers": { "Authorization": "Bearer ${state.plaintext ?? "YOUR_KEY"}" }
    }
  }
}`;

  return (
    <Card>
      <CardHeader
        title="MCP access"
        subtitle="Let Claude Desktop or Cursor query your league. All tools are read-only."
      />
      <div className="space-y-4 p-4">
        {state.status === "created" && state.plaintext ? (
          <Banner tone="success" title="Copy this key now — it won't be shown again">
            <code className="mt-1 block break-all rounded bg-[var(--panel-2)] p-2 font-mono text-xs">
              {state.plaintext}
            </code>
            <p className="mt-2">Paste it into your MCP client config:</p>
            <pre className="mt-1 overflow-x-auto rounded bg-[var(--panel-2)] p-2 font-mono text-[11px]">
              {configSnippet}
            </pre>
          </Banner>
        ) : null}

        {state.status === "error" ? (
          <Banner tone="error" title="Couldn't create the key">
            {state.message}
          </Banner>
        ) : null}

        {keys.length > 0 ? (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{k.label}</span>
                    {k.revokedAt ? (
                      <Badge tone="bad">Revoked</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">{k.prefix}…</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {k.scopes.join(", ")} ·{" "}
                    {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </p>
                </div>
                {!k.revokedAt ? (
                  <form action={revokeApiKeyAction}>
                    <input type="hidden" name="keyId" value={k.id} />
                    <button className="rounded-md border tint-bad px-2.5 py-1 text-xs text-[var(--bad-fg)] transition hover:brightness-95">
                      Revoke
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            No keys yet. Create one to connect an AI client — it&apos;s shown once and stored only as
            a hash.
          </p>
        )}

        <details className="rounded-lg border border-[var(--border)]">
          <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">Create a key</summary>
          <form action={action} className="space-y-3 border-t border-[var(--border)] p-3">
            <input
              name="label"
              placeholder="Claude Desktop"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-xs text-[var(--muted)]">
                Scopes — give a client only what it needs
              </legend>
              {SCOPES.map((s) => (
                <label key={s.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name={`scope:${s.id}`} defaultChecked className="mt-1" />
                  <span>
                    {s.label}
                    <span className="block text-[11px] text-[var(--muted)]">{s.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] sm:w-auto">
              Create key
            </button>
          </form>
        </details>
      </div>
    </Card>
  );
}
