import fs from "node:fs";
import path from "node:path";

type IndexField = { fieldPath: string; order?: string; arrayConfig?: string };
type IndexDef = { collectionGroup: string; queryScope: string; fields: IndexField[] };
type IndexesFile = { indexes: IndexDef[]; fieldOverrides?: unknown[] };

const ROOT = path.resolve(process.cwd(), "..");
const INFRA_DIR = path.join(ROOT, "infra");
const ENV = process.env.INFRA_ENV ?? "dev";

const sourceFile = path.join(INFRA_DIR, "environments", ENV, "firestore.indexes.json");
const targetFile = path.join(INFRA_DIR, "firestore.indexes.json");

function readJson(file: string): IndexesFile {
  if (!fs.existsSync(file)) throw new Error(`missing file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as IndexesFile;
}

function stableKey(index: IndexDef) {
  return JSON.stringify({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: index.fields
  });
}

function hasRequiredCore(indexes: IndexDef[]) {
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
  ] satisfies IndexDef[];

  const keys = new Set(indexes.map(stableKey));
  return required.every((idx) => keys.has(stableKey(idx)));
}

function sync() {
  const src = readJson(sourceFile);
  const out = JSON.stringify(src, null, 2) + "\n";
  fs.writeFileSync(targetFile, out, "utf8");
  console.log(`synced indexes: ${sourceFile} -> ${targetFile}`);
}

function check() {
  const src = readJson(sourceFile);
  if (!Array.isArray(src.indexes)) throw new Error("invalid indexes file: indexes is not array");
  if (!hasRequiredCore(src.indexes)) {
    throw new Error(`missing required core indexes in ${sourceFile}`);
  }

  const target = readJson(targetFile);
  const srcText = JSON.stringify(src);
  const targetText = JSON.stringify(target);
  if (srcText !== targetText) {
    throw new Error(`base indexes out of sync. run: npm run indexes:sync --prefix functions (INFRA_ENV=${ENV})`);
  }

  console.log(`indexes check ok (env=${ENV})`);
}

const cmd = process.argv[2] ?? "check";
if (cmd === "sync") sync();
else if (cmd === "check") check();
else throw new Error(`unknown command: ${cmd}`);
