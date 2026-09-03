/**
 * The core domain layer.
 *
 * Everything re-exported here is pure: no Prisma, no Next, no React, no
 * network. That is enforced by scripts/test-boundaries.mjs, not just by
 * convention, so this directory can be lifted into a standalone package
 * (@fantasy-copilot/core) when the trading app needs to share it — see
 * INTEGRATIONS.md.
 *
 * Rule for contributors: if it touches the database, the framework or the
 * network, it does not belong behind this barrel.
 */

// Scoring and projections
export {
  scoreStatLine,
  round2 as roundPoints,
  type ScoreResult,
  type StatLine,
} from "@/lib/projections/scoring";
export {
  project,
  computeConfidence,
  percentileSpread,
  quantile,
  clamp,
  MODEL_VERSION,
  type GameLine,
  type ProjectionInput,
  type ProjectionOutput,
} from "@/lib/projections/model";

// Retrieval
export { Bm25Index, tokenize, type RagDocument, type ScoredDocument } from "@/lib/rag/bm25";

// Parsing
export { parseCsv, parseRows, num } from "@/lib/data/csv";

// Trades, lineups, waivers
export * from "./trade/engine";
export * from "./trade/value";

// League math
export * from "./league";
export * from "./matchups";
export * from "./schedule";
