import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, needsFirstAccount } from "@/lib/auth/session";
import { AuthForm } from "@/components/AuthForm";
import { Banner, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/");

  const isFirstAccount = await needsFirstAccount();
  const needsInvite = Boolean(process.env.INVITE_CODE) && process.env.ALLOW_SIGNUPS !== "1";

  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {isFirstAccount ? "Claim this deployment" : "Create an account"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isFirstAccount
            ? "Nobody has an account here yet. The first one becomes the owner."
            : "Sign up to sync a league and get lineup, waiver and trade help."}
        </p>
      </div>

      {isFirstAccount ? (
        <Banner tone="info" title="You are setting this up">
          After this, signups are closed unless you set ALLOW_SIGNUPS=1 or hand out an INVITE_CODE.
          A hosted app should not accept strangers because nobody remembered to lock it.
        </Banner>
      ) : null}

      <Card>
        <div className="p-4">
          <AuthForm mode="signup" needsInvite={needsInvite} isFirstAccount={isFirstAccount} />
        </div>
      </Card>

      <p className="text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--accent)] underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
