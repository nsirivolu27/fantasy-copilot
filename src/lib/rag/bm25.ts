/**
 * A small BM25 lexical index.
 *
 * Why not vector embeddings: every embedding API costs money or needs a key,
 * and this project promises neither. League data is also short, factual and
 * full of proper nouns ("Bucky Irving", "FAAB", "SUPER_FLEX") — exactly the
 * case where lexical scoring is strong and semantic search adds little.
 *
 * Pure and dependency-free so it can be unit tested without a database.
 */

export interface RagDocument {
  id: string;
  /** Grouping for filtering: "league" | "team" | "player" | "roster" | "scoring". */
  kind: string;
  title: string;
  /** The text the model actually reads. */
  text: string;
  /** Passed through to the caller; never scored. */
  meta?: Record<string, unknown>;
}

export interface ScoredDocument extends RagDocument {
  score: number;
}

const K1 = 1.5;
const B = 0.75;

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "who", "what",
  "how", "why", "was", "were", "has", "have", "had", "this", "that", "these",
  "those", "from", "can", "should", "would", "could", "will", "get", "got",
  "does", "did", "any", "all", "his", "her", "its", "our", "their", "them",
]);

/** Lowercase, strip punctuation, split. Keeps digits (weeks, budgets, scores). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[-']+|[-']+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export class Bm25Index {
  private docs: RagDocument[] = [];
  private termFreqs: Map<string, number>[] = [];
  private docLengths: number[] = [];
  private docFreq = new Map<string, number>();
  private avgLength = 0;

  constructor(documents: RagDocument[] = []) {
    if (documents.length) this.add(documents);
  }

  add(documents: RagDocument[]): void {
    for (const doc of documents) {
      const tokens = tokenize(`${doc.title} ${doc.text}`);
      const freqs = new Map<string, number>();
      for (const token of tokens) freqs.set(token, (freqs.get(token) ?? 0) + 1);
      for (const term of freqs.keys()) {
        this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
      }
      this.docs.push(doc);
      this.termFreqs.push(freqs);
      this.docLengths.push(tokens.length);
    }
    const total = this.docLengths.reduce((a, b) => a + b, 0);
    this.avgLength = this.docs.length ? total / this.docs.length : 0;
  }

  get size(): number {
    return this.docs.length;
  }

  search(query: string, limit = 8, kinds?: string[]): ScoredDocument[] {
    const terms = tokenize(query);
    if (terms.length === 0 || this.docs.length === 0) return [];

    const N = this.docs.length;
    const results: ScoredDocument[] = [];

    for (let i = 0; i < N; i++) {
      const doc = this.docs[i];
      if (kinds && !kinds.includes(doc.kind)) continue;

      let score = 0;
      for (const term of terms) {
        const tf = this.termFreqs[i].get(term);
        if (!tf) continue;
        const df = this.docFreq.get(term) ?? 0;
        // BM25 idf; the +1 keeps it positive even for very common terms.
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const norm = tf * (K1 + 1);
        const denom = tf + K1 * (1 - B + (B * this.docLengths[i]) / (this.avgLength || 1));
        score += idf * (norm / denom);
      }

      if (score > 0) results.push({ ...doc, score: Math.round(score * 1000) / 1000 });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
