import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { isExpired, sessionExpiry } from "@/lib/core/auth";

export const SESSION_COOKIE = "fc_session";

/**
 * Sessions are opaque random tokens. Only their SHA-256 is stored, so a
 * database leak cannot be replayed as a login.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, userAgent?: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry();

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 200) },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  isOwner: boolean;
}

/** The signed-in user, or null. Expired sessions are deleted as they're found. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session
    .findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
    .catch(() => null);
  if (!session) return null;

  if (isExpired(session.expiresAt)) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    isOwner: session.user.isOwner,
  };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

/** True when nobody has claimed this deployment yet. */
export async function needsFirstAccount(): Promise<boolean> {
  try {
    return (await prisma.user.count()) === 0;
  } catch {
    // No table yet means the schema has not been pushed; treat as unclaimed.
    return true;
  }
}

/** Whether accounts are required at all. Off by default, for local single use. */
export function authEnabled(): boolean {
  return process.env.REQUIRE_AUTH === "1";
}
