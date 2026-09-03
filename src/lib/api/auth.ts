import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * API keys for the MCP endpoint, so an AI client (Claude Desktop, Cursor) can
 * query the league without a browser session.
 *
 * Only a SHA-256 hash is stored, the plaintext is shown once at creation and
 * never again, so a database leak doesn't hand over working credentials.
 */

export type Scope = "read:league" | "read:projections" | "read:trades";

export const ALL_SCOPES: Scope[] = ["read:league", "read:projections", "read:trades"];

const PREFIX = "fcp_";

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${PREFIX}${secret}`;
  return { plaintext, hash: hashKey(plaintext), prefix: plaintext.slice(0, 12) };
}

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export interface AuthResult {
  ok: boolean;
  keyId?: string;
  label?: string;
  scopes?: Scope[];
  error?: string;
  status?: number;
}

/**
 * Authenticates a request and checks one required scope.
 * Returns a result rather than throwing so routes stay explicit.
 */
export async function authenticate(request: Request, required: Scope): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return { ok: false, error: "Missing bearer token.", status: 401 };
  }

  const hash = hashKey(token);
  const key = await prisma.apiKey.findUnique({ where: { hash } });

  // Constant-time compare so a wrong-but-existing key can't be found by timing.
  if (!key || !safeEqual(key.hash, hash)) {
    return { ok: false, error: "Unknown API key.", status: 401 };
  }
  if (key.revokedAt) {
    return { ok: false, error: "This API key was revoked.", status: 401 };
  }

  const scopes = safeScopes(key.scopesJson);
  if (!scopes.includes(required)) {
    return {
      ok: false,
      error: `This key is missing the "${required}" scope. It has: ${scopes.join(", ") || "none"}.`,
      status: 403,
    };
  }

  // Fire-and-forget: a slow write shouldn't delay the response.
  void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { ok: true, keyId: key.id, label: key.label, scopes };
}

function safeScopes(json: string): Scope[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Scope[]) : [];
  } catch {
    return [];
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
