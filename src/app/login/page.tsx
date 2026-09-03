import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, needsFirstAccount } from "@/lib/auth/session";
import { AuthForm } from "@/components/AuthForm";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  // A fresh deployment should not show a sign-in form nobody can satisfy.
  if (await needsFirstAccount()) redirect("/signup");

  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Welcome back.</p>
      </div>

      <Card>
        <div className="p-4">
          <AuthForm mode="signin" />
        </div>
      </Card>

      <p className="text-center text-sm text-[var(--muted)]">
        No account?{" "}
        <Link href="/signup" className="text-[var(--accent)] underline">
          Create one
        </Link>
      </p>

      <p className="text-center text-xs text-[var(--faint)]">
        There is no password reset yet, because this app sends no email. The owner can reset a
        password directly in the database.
      </p>
    </div>
  );
}
