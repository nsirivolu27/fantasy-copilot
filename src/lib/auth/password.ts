import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/**
 * Password hashing with scrypt from node:crypto.
 *
 * No dependency: bcrypt and argon2 both need native builds, which is a real
 * cost for a self-hosted app that should install cleanly everywhere. scrypt is
 * memory-hard, in the standard library, and appropriate here.
 *
 * Stored as `scrypt$N$r$p$salt$hash`, so the parameters travel with the hash
 * and can be raised later without invalidating existing passwords.
 */
const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, salt, hash] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const derived = (await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    })) as Buffer;

    const expected = Buffer.from(hash, "base64");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    // A malformed stored hash must fail closed, not throw into a login form.
    return false;
  }
}
