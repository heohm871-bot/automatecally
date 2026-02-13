import fs from "node:fs";
import path from "node:path";

/**
 * CI-friendly Firestore indexes check.
 *
 * - Does NOT compile TypeScript.
 * - Only validates that `infra/firestore.indexes.json` is in sync with
 *   `infra/environments/$INFRA_ENV/firestore.indexes.json` and contains core indexes.
 *
 * Run:
 *   INFRA_ENV=staging node scripts/indexes-check.mjs
 */

const ENV = String(process.env.INFRA_ENV ?? "dev").trim() || "dev";

// When invoked via `npm --prefix functions run ...`, cwd is `functions/`.
const ROOT = path.resolve(process.cwd(), "..");
const INFRA_DIR = path.join(ROOT, "infra");

const sourceFile = path.join(INFRA_DIR, "environments", ENV, "firestore.indexes.json");
const targetFile = path.join(INFRA_DIR, "firestore.indexes.json");

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`missing file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stableKey(index) {
  return JSON.stringify({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: index.fields
  });
}

function hasRequiredCore(indexes) {
  const required = [
    {
      collectionGroup: "articles",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "siteId", order: "ASCENDING" },
        { fieldPath: "createdAt", order: "DESCENDING" }
      ]
    },
    {
      collectionGroup: "keywords",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "siteId", order: "ASCENDING" },
        { fieldPath: "status", order: "ASCENDING" }
      ]
    }
  ];

  const keys = new Set(indexes.map(stableKey));
  return required.every((idx) => keys.has(stableKey(idx)));
}

function main() {
  const src = readJson(sourceFile);
  if (!Array.isArray(src.indexes)) throw new Error(`invalid indexes file: ${sourceFile} (indexes is not array)`);
  if (!hasRequiredCore(src.indexes)) throw new Error(`missing required core indexes in ${sourceFile}`);

  const target = readJson(targetFile);
  const srcText = JSON.stringify(src);
  const targetText = JSON.stringify(target);
  if (srcText !== targetText) {
    throw new Error(
      `base indexes out of sync (env=${ENV}). ` +
        `Run: INFRA_ENV=${ENV} npm run indexes:sync --prefix functions`
    );
  }

  console.log(`indexes check ok (env=${ENV})`);
}

main();

