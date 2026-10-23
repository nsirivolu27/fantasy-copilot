/**
 * Account rules: what makes an email or a password acceptable.
 *
 * Pure and self-contained, so the rules are unit tested rather than trusted.
 * Hashing and sessions live outside core, in src/lib/auth, because they need
 * node:crypto and the database.
 */

export interface Validation {
  ok: boolean;
  /** Written for the person typing, not for a log. */
  error?: string;
}

/** Lowercase and trim. Emails are compared normalized, always. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): Validation {
  const value = normalizeEmail(email);
  if (!value) return { ok: false, error: "Enter an email address." };
  if (value.length > 254) return { ok: false, error: "That email address is too long." };
  // Deliberately loose. Over-strict email regexes reject valid addresses, and
  // the real check is whether mail arrives, which this app does not send.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { ok: false, error: "That does not look like an email address." };
  }
  return { ok: true };
}

/** The 20 most common passwords, which account for a large share of real breaches. */
const COMMON = new Set([
  "password", "123456", "12345678", "123456789", "qwerty", "abc123", "111111",
  "password1", "1234567", "letmein", "welcome", "monkey", "dragon", "football",
  "iloveyou", "admin", "sunshine", "princess", "passw0rd", "qwerty123",
]);

/**
 * Length over composition rules.
 *
 * Character-class requirements push people toward Passw0rd! and a sticky note.
 * A 12 character minimum with a common-password check is stronger in practice
 * and less annoying, which is why NIST moved this way.
 */
export function validatePassword(password: string, email?: string): Validation {
  if (!password) return { ok: false, error: "Enter a password." };
  if (password.length < 12) {
    return { ok: false, error: "Use at least 12 characters. Length matters more than symbols." };
  }
  if (password.length > 200) return { ok: false, error: "That password is too long." };

  const lower = password.toLowerCase();
  if (COMMON.has(lower)) {
    return { ok: false, error: "That is one of the most common passwords. Pick something else." };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, error: "One repeated character is not a password." };
  }
  if (email) {
    const local = normalizeEmail(email).split("@")[0];
    if (local.length >= 3 && lower.includes(local)) {
      return { ok: false, error: "Do not put your email address in your password." };
    }
  }
  return { ok: true };
}

/** Display name shown to leaguemates. Optional, so an empty one is fine. */
export function validateDisplayName(name: string): Validation {
  const value = name.trim();
  if (value.length > 60) return { ok: false, error: "Keep the display name under 60 characters." };
  if (/[<>]/.test(value)) return { ok: false, error: "Angle brackets are not allowed in a name." };
  return { ok: true };
}

/** How long a signed-in session lasts before it has to be renewed. */
export const SESSION_DAYS = 30;

export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * Who may create an account.
 *
 * The first account always succeeds, so a fresh deployment can be claimed by
 * whoever sets it up. After that, signup is closed unless the operator opens
 * it or hands out an invite code. That default matters: an app hosted for a
 * league should not accept strangers because nobody remembered to lock it.
 */
export function canSignUp(args: {
  existingUsers: number;
  signupsOpen: boolean;
  inviteCode?: string | null;
  suppliedCode?: string | null;
}): Validation {
  if (args.existingUsers === 0) return { ok: true };
  if (args.signupsOpen) return { ok: true };

  if (args.inviteCode) {
    const supplied = (args.suppliedCode ?? "").trim();
    if (!supplied) return { ok: false, error: "This app is invite only. Enter your invite code." };
    if (!constantTimeEqual(supplied, args.inviteCode)) {
      return { ok: false, error: "That invite code is not valid." };
    }
    return { ok: true };
  }

  return { ok: false, error: "Signups are closed on this deployment. Ask the owner for an invite." };
}

/** Length-independent comparison, so a wrong code cannot be found by timing. */
export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
