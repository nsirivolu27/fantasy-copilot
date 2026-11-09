"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { syncLeagueAction, type SyncFormState } from "@/app/actions";
import { Banner } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Syncing…" : "Sync league"}
    </button>
  );
}

export function SyncForm({ defaultLeagueId }: { defaultLeagueId?: string }) {
  const [state, action] = useActionState<SyncFormState, FormData>(syncLeagueAction, {
    status: "idle",
  });

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="platform" className="mb-1.5 block text-sm font-medium">
          Platform
        </label>
        <select
          id="platform"
          name="platform"
          defaultValue="sleeper"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        >
          <option value="sleeper">Sleeper, no login needed</option>
          <option value="espn" disabled>
            ESPN. Phase 7
          </option>
          <option value="manual" disabled>
            Manual / CSV. Phase 7
          </option>
        </select>
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Sleeper&apos;s read API is public. No account, password, or API key is required, and nothing
          is sent anywhere except Sleeper.
        </p>
      </div>

      <div>
        <label htmlFor="leagueId" className="mb-1.5 block text-sm font-medium">
          Sleeper league ID
        </label>
        <input
          id="leagueId"
          name="leagueId"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={defaultLeagueId}
          placeholder="1124839284756483920"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 font-mono text-sm outline-none focus:border-[var(--accent)]"
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Find it in your league&apos;s web URL:{" "}
          <span className="font-mono text-[var(--text)]">sleeper.com/leagues/</span>
          <span className="font-mono text-[var(--accent)]">&lt;this number&gt;</span>
          <span className="font-mono text-[var(--text)]">/team</span>
        </p>
      </div>

      <SubmitButton />

      {state.status === "error" ? (
        <Banner tone="bad" title="Sync failed">
          {state.message}
        </Banner>
      ) : null}

      {state.status === "ok" ? (
        <Banner tone="good" title="Sync complete">
          {state.message}
          {state.warnings && state.warnings.length > 0 ? (
            <ul className="mt-1.5 list-inside list-disc">
              {state.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </Banner>
      ) : null}
    </form>
  );
}
