/**
 * Typed helpers for the JSON-in-TEXT columns (see prisma/schema.prisma).
 * They never throw: a corrupt or empty column falls back to the default.
 */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}
