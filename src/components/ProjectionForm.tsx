"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { refreshProjectionsAction, type ProjectionFormState } from "@/app/actions";
import { Banner } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition hoverable disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Downloading stats and projecting…" : "Refresh projections"}
    </button>
  );
}

export function ProjectionForm() {
  const [state, action] = useActionState<ProjectionFormState, FormData>(refreshProjectionsAction, {
    status: "idle",
  });

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-[var(--muted)]">
        Downloads this season&apos;s nflverse stats (a few MB) and projects every rostered player,
        scoring each past game with your league&apos;s own settings. Takes a minute the first time.
      </p>
      <SubmitButton />
      {state.status === "error" ? (
        <Banner tone="bad" title="Projection run failed">
          {state.message}
        </Banner>
      ) : null}
      {state.status === "ok" ? (
        <Banner tone="good" title="Projections updated">
          {state.message}
        </Banner>
      ) : null}
    </form>
  );
}
