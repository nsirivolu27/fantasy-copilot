// Enforces the core/ layer boundary.
//
// Everything under src/lib/core/ must stay pure: no database, no framework, no
// network, no validation library. That is what makes it liftable into a shared
// package (@fantasy-copilot/core) for the trading app, and what keeps it
// testable without a running app. Convention rots; a test doesn't.
//
// Run: node --experimental-strip-types scripts/test-boundaries.mjs

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.join(root, "src", "lib", "core");

/** Imports that must never appear inside core. */
const FORBIDDEN = [
  { pattern: /@prisma\/client|["']@\/lib\/db["']|\bprisma\./, why: "database access" },
  { pattern: /from\s+["']next(\/|["'])/, why: "Next.js framework" },
  { pattern: /from\s+["']react(\/|["'])/, why: "React" },
  { pattern: /from\s+["']zod["']/, why: "zod (core validates by hand so it has no deps)" },
  { pattern: /from\s+["']node:(fs|child_process|net|http)/, why: "Node I/O" },
];

/** The barrel re-exports app modules by design; the rule is for real logic. */
const EXEMPT = new Set(["index.ts"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\nCore layer boundaries\n");

const files = walk(coreDir);

test("core contains modules to check", () => {
  assert.ok(files.length >= 2, "expected at least two files under src/lib/core");
});

test("no core module imports the database, the framework or a dependency", () => {
  const violations = [];
  for (const file of files) {
    const rel = path.relative(coreDir, file);
    if (EXEMPT.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(source)) violations.push(`${rel}: ${rule.why}`);
    }
  }
  assert.deepEqual(violations, [], `core purity violated:\n  ${violations.join("\n  ")}`);
});

test("core modules have no relative imports of each other", () => {
  // Node's type-stripping can't resolve extensionless relative imports, which
  // is what lets these modules be unit tested directly. Keeping them
  // self-contained is the constraint that preserves that.
  const violations = [];
  for (const file of files) {
    const rel = path.relative(coreDir, file);
    if (EXEMPT.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    const matches = source.match(/from\s+["']\.[^"']*["']/g) ?? [];
    for (const m of matches) violations.push(`${rel}: ${m}`);
  }
  assert.deepEqual(violations, [], `core modules must be self-contained:\n  ${violations.join("\n  ")}`);
});

console.log(`\n${passed} passing\n`);
