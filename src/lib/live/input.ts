/** Accept an ID or a Sleeper league URL, never an arbitrary upstream URL. */
export function parseLeagueInput(input: string): string | null {
  const value = input.trim();
  if (/^\d{10,25}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["sleeper.com", "sleeper.app", "www.sleeper.com", "www.sleeper.app"].includes(url.hostname)) return null;
    return url.pathname.match(/^\/(?:leagues|league)\/(\d{10,25})(?:\/|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
