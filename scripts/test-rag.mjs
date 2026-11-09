// Dependency-free checks on the retrieval layer.
// Run: node --experimental-strip-types scripts/test-rag.mjs

import assert from "node:assert/strict";
import { Bm25Index, tokenize } from "../src/lib/rag/bm25.ts";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const DOCS = [
  {
    id: "league:1",
    kind: "league",
    title: "League: tech rejects",
    text: "tech rejects is a 12-team football league on sleeper. Season 2026, currently week 1. Waivers use FAAB with a $100 budget per team.",
  },
  {
    id: "scoring:1",
    kind: "scoring",
    title: "Scoring settings for tech rejects",
    text: "Reception (rec): 1 points; Passing TD (pass_td): 4 points. This is a full PPR league.",
  },
  {
    id: "roster:a",
    kind: "roster",
    title: "Roster: tech rejects",
    text: "tech rejects roster. Starters: RB Christian McCaffrey, TE Travis Kelce. Bench: Chuba Hubbard.",
  },
  {
    id: "roster:b",
    kind: "roster",
    title: "Roster: Sam's Squad",
    text: "Sam's Squad roster. Starters: QB Josh Allen, WR Justin Jefferson. Bench: Trey McBride.",
  },
  {
    id: "player:kelce",
    kind: "player",
    title: "Player: Travis Kelce",
    text: "Travis Kelce is a TE for KC. Rostered by tech rejects in the starting TE slot. Injury status: Questionable.",
  },
];

console.log("\nRetrieval (BM25)\n");

test("tokenizer keeps digits and drops stopwords", () => {
  const t = tokenize("What is the FAAB budget for week 12?");
  assert.ok(t.includes("faab"));
  assert.ok(t.includes("budget"));
  assert.ok(t.includes("12"));
  assert.ok(!t.includes("the"));
  assert.ok(!t.includes("what"));
});

test("apostrophes and punctuation don't break tokens", () => {
  const t = tokenize("Sam's Squad. Ja'Marr Chase (WR)!");
  assert.ok(t.includes("sam's") || t.includes("sams") || t.includes("sam"));
  assert.ok(t.includes("chase"));
  assert.ok(t.includes("squad"));
});

test("a player question retrieves that player's document first", () => {
  const index = new Bm25Index(DOCS);
  const hits = index.search("is Travis Kelce injured");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].id, "player:kelce");
});

test("a scoring question retrieves the scoring document", () => {
  const index = new Bm25Index(DOCS);
  const hits = index.search("how many points is a reception worth");
  assert.equal(hits[0].id, "scoring:1");
});

test("a league-rules question retrieves league settings", () => {
  const index = new Bm25Index(DOCS);
  const hits = index.search("what is the FAAB budget");
  assert.equal(hits[0].id, "league:1");
});

test("kind filter restricts the corpus", () => {
  const index = new Bm25Index(DOCS);
  const hits = index.search("Travis Kelce", 5, ["roster"]);
  assert.ok(hits.every((h) => h.kind === "roster"));
  assert.equal(hits[0].id, "roster:a");
});

test("rarer terms outrank common ones", () => {
  const index = new Bm25Index(DOCS);
  // "roster" appears in many docs; "McBride" in exactly one.
  const hits = index.search("McBride roster");
  assert.equal(hits[0].id, "roster:b");
});

test("no match returns empty rather than noise", () => {
  const index = new Bm25Index(DOCS);
  assert.deepEqual(index.search("cryptocurrency arbitrage"), []);
  assert.deepEqual(index.search(""), []);
});

test("an empty index is safe to query", () => {
  const index = new Bm25Index([]);
  assert.equal(index.size, 0);
  assert.deepEqual(index.search("anything"), []);
});

test("limit is respected and results are sorted by score", () => {
  const index = new Bm25Index(DOCS);
  const hits = index.search("tech rejects roster starters", 2);
  assert.equal(hits.length, 2);
  assert.ok(hits[0].score >= hits[1].score);
});

console.log(`\n${passed} passing\n`);
