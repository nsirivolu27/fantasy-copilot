// Prisma requires the datasource provider to be a literal string, so it can't
// read the provider from an env var. This generates prisma/generated-schema.prisma
// from the committed schema with the provider that matches DATABASE_URL.
//
//   file:./dev.db          -> sqlite   (local dev, zero setup)
//   postgres://... | postgresql://...  -> postgresql (deployments)
//   unset                  -> postgresql (safe default for a build step)
//
// Every npm db:* script and the build run this first. The generated file is
// gitignored, so the committed schema never churns.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "prisma", "schema.prisma");
const target = path.join(root, "prisma", "generated-schema.prisma");

const url = process.env.DATABASE_URL ?? "";
let provider = "postgresql";
if (url.startsWith("file:")) provider = "sqlite";
else if (url.startsWith("mysql://")) provider = "mysql";

const schema = readFileSync(source, "utf8").replace(
  /provider\s*=\s*"(sqlite|postgresql|mysql)"/,
  `provider = "${provider}"`,
);

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, schema);
console.log(`[prisma] generated schema with provider="${provider}"`);
