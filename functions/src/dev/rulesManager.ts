import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const INFRA_DIR = path.join(ROOT, "infra");
const ENV = process.env.INFRA_ENV ?? "dev";

const sourceFile = path.join(INFRA_DIR, "environments", ENV, "firestore.rules");
const targetFile = path.join(INFRA_DIR, "firestore.rules");

function readText(file: string) {
  if (!fs.existsSync(file)) throw new Error(`missing file: ${file}`);
  return fs.readFileSync(file, "utf8");
}

function sync() {
  const src = readText(sourceFile);
  fs.writeFileSync(targetFile, src.endsWith("\n") ? src : `${src}\n`, "utf8");
  console.log(`synced rules: ${sourceFile} -> ${targetFile}`);
}

function check() {
  const src = readText(sourceFile).trimEnd();
  const target = readText(targetFile).trimEnd();
  if (src !== target) {
    throw new Error(`base rules out of sync. run: INFRA_ENV=${ENV} npm run rules:sync --prefix functions`);
  }
  console.log(`rules check ok (env=${ENV})`);
}

const cmd = process.argv[2] ?? "check";
if (cmd === "sync") sync();
else if (cmd === "check") check();
else throw new Error(`unknown command: ${cmd}`);

