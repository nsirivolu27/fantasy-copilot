import { readFile } from "node:fs/promises";
import nodePath from "node:path";
import { PlatformError } from "../types";

const BASE = "https://api.sleeper.app/v1";

/**
 * Offline demo mode. Set SLEEPER_FIXTURES=1 to serve the JSON in /fixtures
 * instead of calling Sleeper, useful for developing without a league ID or
 * on a network that can't reach the API. Never enabled in production.
 */
const USE_FIXTURES = process.env.SLEEPER_FIXTURES === "1";

const FIXTURE_MAP: { test: RegExp; file: string }[] = [
  { test: /^\/state\/nfl$/, file: "state.json" },
  { test: /^\/league\/[^/]+$/, file: "league.json" },
  { test: /^\/league\/[^/]+\/rosters$/, file: "rosters.json" },
  { test: /^\/league\/[^/]+\/users$/, file: "users.json" },
  { test: /^\/players\/nfl$/, file: "players.json" },
  { test: /^\/league\/[^/]+\/matchups\/\d+$/, file: "matchups.json" },
];

async function readFixture<T>(pathname: string): Promise<T> {
  const match = FIXTURE_MAP.find((f) => f.test.test(pathname));
  if (!match) throw new PlatformError(`No fixture for ${pathname}`, "not_found");
  const file = nodePath.join(process.cwd(), "fixtures", match.file);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    throw new PlatformError(`Fixture ${match.file} is missing or invalid.`, "not_found");
  }
}

/**
 * Thin fetch wrapper. Sleeper's read API needs no key and no auth.
 * Every failure becomes a PlatformError so callers never see a raw throw.
 */
export async function sleeperGet<T>(path: string, init?: { timeoutMs?: number }): Promise<T> {
  if (USE_FIXTURES) return readFixture<T>(path);

  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 20_000);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new PlatformError(
      aborted ? `Sleeper request timed out: ${path}` : `Could not reach Sleeper: ${path}`,
      "network",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    throw new PlatformError(`Sleeper returned 404 for ${path}. Check the league ID.`, "not_found", 404);
  }
  if (res.status === 429) {
    throw new PlatformError("Sleeper rate limit hit. Wait a minute and retry.", "rate_limited", 429);
  }
  if (!res.ok) {
    throw new PlatformError(`Sleeper returned ${res.status} for ${path}.`, "unknown", res.status);
  }

  const text = await res.text();
  // Sleeper answers "null" (200) for a valid-looking but nonexistent league.
  if (!text || text === "null") {
    throw new PlatformError(`Sleeper returned no data for ${path}. Check the league ID.`, "not_found");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PlatformError(`Sleeper sent a response that wasn't JSON for ${path}.`, "bad_shape");
  }
}

export const SLEEPER_BASE_URL = BASE;
