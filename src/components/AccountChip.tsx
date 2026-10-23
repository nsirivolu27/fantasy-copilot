import Link from "next/link";
import { getCurrentUser, authEnabled } from "@/lib/auth/session";
import { signOutAction } from "@/app/auth-actions";

/** Who is signed in, and the way out. Hidden entirely when auth is off. */
export async function AccountChip() {
  if (!authEnabled()) return null;

  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link
        href="/login"
        className="hoverable shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)]"
      >
        Sign in
      </Link>
    );
  }

  return (
    <form action={signOutAction} className="flex shrink-0 items-center gap-2">
      <span
        className="hidden max-w-[10rem] truncate text-xs text-[var(--muted)] sm:block"
        title={user.email}
      >
        {user.displayName || user.email}
      </span>
      <button className="hoverable rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)]">
        Sign out
      </button>
    </form>
  );
}
