import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";

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

function scrypt(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LENGTH, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, salt, hash] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const derived = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });

    const expected = Buffer.from(hash, "base64");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    // A malformed stored hash must fail closed, not throw into a login form.
    return false;
  }
}
