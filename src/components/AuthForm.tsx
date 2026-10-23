"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction, signUpAction, type AuthFormState } from "@/app/auth-actions";
import { Banner } from "@/components/ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Working..." : label}
    </button>
  );
}

const field =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";

export function AuthForm({
  mode,
  needsInvite,
  isFirstAccount,
}: {
  mode: "signin" | "signup";
  needsInvite?: boolean;
  isFirstAccount?: boolean;
}) {
  const action = mode === "signup" ? signUpAction : signInAction;
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {mode === "signup" ? (
        <div>
          <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium">
            Display name <span className="text-[var(--muted)]">(optional)</span>
          </label>
          <input id="displayName" name="displayName" autoComplete="nickname" className={field} />
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={field}
        />
        {mode === "signup" ? (
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            At least 12 characters. A short phrase you will remember beats a symbol soup you will
            not.
          </p>
        ) : null}
      </div>

      {mode === "signup" && needsInvite && !isFirstAccount ? (
        <div>
          <label htmlFor="inviteCode" className="mb-1.5 block text-sm font-medium">
            Invite code
          </label>
          <input id="inviteCode" name="inviteCode" className={field} />
        </div>
      ) : null}

      <Submit label={mode === "signup" ? "Create account" : "Sign in"} />

      {state.error ? <Banner tone="bad" title={state.error} /> : null}
    </form>
  );
}
