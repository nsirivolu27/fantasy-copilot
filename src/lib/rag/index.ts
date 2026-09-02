import { Bm25Index, type RagDocument, type ScoredDocument } from "./bm25";
import { buildLeagueDocuments } from "./documents";

export type { RagDocument, ScoredDocument } from "./bm25";
export { Bm25Index, tokenize } from "./bm25";

/**
 * Per-league index cache.
 *
 * The corpus is small (a 12-team league is a few hundred short documents), so
 * rebuilding takes milliseconds and lives in memory. The cache is invalidated
 * by time and by an explicit call after each sync.
 */
interface CacheEntry {
  index: Bm25Index;
  builtAt: number;
  documents: RagDocument[];
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export async function getLeagueIndex(leagueId: string): Promise<CacheEntry> {
  const cached = CACHE.get(leagueId);
  if (cached && Date.now() - cached.builtAt < TTL_MS) return cached;

  const documents = await buildLeagueDocuments(leagueId);
  const entry: CacheEntry = { index: new Bm25Index(documents), builtAt: Date.now(), documents };
  CACHE.set(leagueId, entry);
  return entry;
}

/** Call after a sync so the next question sees fresh rosters. */
export function invalidateLeagueIndex(leagueId?: string): void {
  if (leagueId) CACHE.delete(leagueId);
  else CACHE.clear();
}

export async function retrieve(
  leagueId: string,
  query: string,
  options: { limit?: number; kinds?: string[] } = {},
): Promise<ScoredDocument[]> {
  const { index } = await getLeagueIndex(leagueId);
  return index.search(query, options.limit ?? 8, options.kinds);
}

/** Formats retrieved documents as the context block handed to the model. */
export function formatContext(docs: ScoredDocument[]): string {
  if (docs.length === 0) return "No matching league data was found.";
  return docs
    .map((d, i) => `[${i + 1}] ${d.title}\n${d.text}`)
    .join("\n\n");
}
