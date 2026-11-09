"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { canSignUp, normalizeEmail, validateDisplayName, validateEmail, validatePassword } from "@/lib/core/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

export interface AuthFormState {
  error?: string;
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email")?.toString() ?? "");
  const password = formData.get("password")?.toString() ?? "";
  const displayName = formData.get("displayName")?.toString() ?? "";
  const inviteCode = formData.get("inviteCode")?.toString() ?? "";

  for (const check of [
    validateEmail(email),
    validatePassword(password, email),
    validateDisplayName(displayName),
  ]) {
    if (!check.ok) return { error: check.error };
  }

  const existingUsers = await prisma.user.count();
  const gate = canSignUp({
    existingUsers,
    signupsOpen: process.env.ALLOW_SIGNUPS === "1",
    inviteCode: process.env.INVITE_CODE ?? null,
    suppliedCode: inviteCode,
  });
  if (!gate.ok) return { error: gate.error };

  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: "An account with that email already exists. Try signing in." };
  }

  const user = await prisma.user.create({
    data: {
      email,
      displayName: displayName.trim() || null,
      passwordHash: await hashPassword(password),
      // Whoever creates the first account owns the deployment.
      isOwner: existingUsers === 0,
    },
  });

  const agent = (await headers()).get("user-agent") ?? undefined;
  await createSession(user.id, agent);
  redirect("/settings");
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email")?.toString() ?? "");
  const password = formData.get("password")?.toString() ?? "";

  const user = await prisma.user.findUnique({ where: { email } });

  // Hash even when the user is missing, so a wrong email and a wrong password
  // take the same time and the form cannot be used to enumerate accounts.
  const stored = user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA";
  const valid = await verifyPassword(password, stored);

  if (!user || !valid) {
    return { error: "That email and password do not match an account." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, (await headers()).get("user-agent") ?? undefined);
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
