import { randomUUID } from "node:crypto";

import { bucket, db } from "../lib/admin";

type PromoteArgs = {
  siteId: string;
  articleId: string;
  runTag: "prod-rerun" | "backfill";
  runReason: string;
  requestedByUid: string;
  dryRun: boolean;
  force: boolean;
  confirmProd: boolean;
  override: boolean;
  overrideReason: string;
  ticketId: string;
  approvedBy: string;
};

function getRuntimeEnv() {
  // Prefer an explicit APP_ENV; fall back to common local convention.
  const v = String(process.env.APP_ENV ?? process.env.INFRA_ENV ?? "").trim().toLowerCase();
  if (v === "prod" || v === "production") return "prod";
  if (v === "staging") return "staging";
  if (v === "dev" || v === "development") return "dev";
  return "dev";
}

function pick(argv: string[], key: string): string | null {
  const idx = argv.indexOf(key);
  const v = idx >= 0 ? argv[idx + 1] : null;
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function hasFlag(argv: string[], key: string) {
  return argv.includes(key);
}

function pickRunTag(argv: string[]): PromoteArgs["runTag"] {
  const raw = (pick(argv, "--runTag") ?? "").trim();
  if (raw === "prod-rerun" || raw === "backfill") return raw;
  throw new Error("missing/invalid --runTag (allowed: prod-rerun | backfill)");
}

function requireNonEmpty(v: string | null, label: string) {
  if (!v) throw new Error(`missing ${label}`);
  return v;
}

function parseArgs(argv: string[]): PromoteArgs {
  const siteId = requireNonEmpty(pick(argv, "--siteId"), "--siteId");
  const articleId = requireNonEmpty(pick(argv, "--articleId"), "--articleId");
  const runTag = pickRunTag(argv);
  const runReason = requireNonEmpty(pick(argv, "--runReason"), "--runReason").slice(0, 200);
  const requestedByUid = (pick(argv, "--requestedByUid") ?? "OPS").slice(0, 64);

  const override = hasFlag(argv, "--override");
  const overrideReason = (pick(argv, "--overrideReason") ?? "").trim().slice(0, 240);
  const ticketId = (pick(argv, "--ticketId") ?? "").trim().slice(0, 80);
  const approvedBy = (pick(argv, "--approvedBy") ?? "").trim().slice(0, 80);

  return {
    siteId,
    articleId,
    runTag,
    runReason,
    requestedByUid,
    dryRun: hasFlag(argv, "--dryRun"),
    force: hasFlag(argv, "--force"),
    confirmProd: hasFlag(argv, "--confirmProd"),
    override,
    overrideReason,
    ticketId,
    approvedBy
  };
}

function packageBasePath(siteId: string, articleId: string, runTag: string) {
  if (!runTag || runTag === "default") return `sites/${siteId}/articles/${articleId}/package`;
  return `sites/${siteId}/articles/${articleId}/package_${runTag}`;
}

async function assertExistsGcsObject(name: string) {
  const [exists] = await bucket().file(name).exists();
  if (!exists) throw new Error(`missing object: ${name}`);
}

async function readJsonFromGcs(name: string): Promise<unknown> {
  const [buf] = await bucket().file(name).download();
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw new Error(`invalid json: ${name}`);
  }
}

function logJson(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

async function run() {
  const env = getRuntimeEnv();
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (env === "prod" && !args.confirmProd) {
    throw new Error("refusing to run in prod without --confirmProd");
  }
  if (env === "prod" && args.override) {
    if (!args.overrideReason) throw new Error("prod override requires --overrideReason");
    if (!args.ticketId) throw new Error("prod override requires --ticketId");
    if (!args.approvedBy) throw new Error("prod override requires --approvedBy");
  }

  const sourceBase = packageBasePath(args.siteId, args.articleId, args.runTag);
  const destBase = packageBasePath(args.siteId, args.articleId, "default");

  const required = ["title.txt", "post.html", "meta.json"] as const;
  const requiredSrc = required.map((p) => `${sourceBase}/${p}`);
  const requiredDst = required.map((p) => `${destBase}/${p}`);

  const runId = `pkgpromote_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const startedAtIso = new Date().toISOString();

  logJson({
    ok: true,
    event: "package_promote_start",
    runId,
    env,
    siteId: args.siteId,
    articleId: args.articleId,
    runTag: args.runTag,
    runReason: args.runReason,
    requestedByUid: args.requestedByUid,
    sourceBase,
    destBase,
    dryRun: args.dryRun,
    force: args.force,
    override: args.override,
    overrideReason: args.override ? args.overrideReason : "",
    ticketId: args.override ? args.ticketId : "",
    approvedBy: args.override ? args.approvedBy : "",
    startedAt: startedAtIso
  });

  const articleRef = db().doc(`articles/${args.articleId}`);
  const articleSnap = await articleRef.get();
  if (!articleSnap.exists) throw new Error(`missing firestore doc: articles/${args.articleId}`);
  const article = (articleSnap.data() ?? {}) as {
    siteId?: string;
    runDate?: string;
    packagePath?: string;
    runTag?: string | null;
    status?: string;
    lifecycle?: string;
  };
  if (String(article.siteId ?? "") !== args.siteId) {
    throw new Error(`siteId mismatch: articles/${args.articleId}.siteId != --siteId`);
  }
  if (env === "prod" && !args.override) {
    // Guardrail: promotion is a governance decision; require that packaging already completed.
    // Keep "published" allowed for future publish integration (published-but-not-promoted is valid).
    if (article.status !== "packaged" && article.status !== "published") {
      throw new Error(
        `prod safety: expected articles/${args.articleId}.status to be packaged/published before promote but got ${String(
          article.status ?? ""
        )}`
      );
    }
    // In prod, require that the current packagePath points to the source we're promoting.
    if (String(article.packagePath ?? "") !== sourceBase) {
      throw new Error(
        `prod safety: expected articles/${args.articleId}.packagePath to be ${sourceBase} but got ${String(
          article.packagePath ?? ""
        )}`
      );
    }
    // Also require that the article's provenance runTag matches the source package we're promoting.
    if (String(article.runTag ?? "") !== args.runTag) {
      throw new Error(
        `prod safety: expected articles/${args.articleId}.runTag to be ${args.runTag} but got ${String(
          article.runTag ?? ""
        )}`
      );
    }
  }

  for (const name of requiredSrc) await assertExistsGcsObject(name);

  const metaAny = await readJsonFromGcs(`${sourceBase}/meta.json`);
  const meta = (metaAny ?? {}) as {
    siteId?: unknown;
    articleId?: unknown;
    runDate?: unknown;
    traceId?: unknown;
    runTag?: unknown;
    createdAt?: unknown;
  };
  if (String(meta.siteId ?? "") !== args.siteId || String(meta.articleId ?? "") !== args.articleId) {
    throw new Error("meta.json mismatch: expected {siteId, articleId} to match inputs");
  }
  if (env === "prod" && !args.override) {
    if (String(meta.runTag ?? "") !== args.runTag) {
      throw new Error(`prod safety: meta.json mismatch: expected runTag=${args.runTag}`);
    }
    if (typeof article.runDate === "string" && article.runDate && String(meta.runDate ?? "") !== article.runDate) {
      throw new Error("prod safety: meta.json mismatch: runDate does not match article.runDate");
    }
  }

  const [existingDestFiles] = await bucket().getFiles({ prefix: `${destBase}/` });
  if (existingDestFiles.length > 0 && !args.force) {
    throw new Error(`destination not empty (${destBase}/). rerun with --force to overwrite`);
  }

  const [sourceFiles] = await bucket().getFiles({ prefix: `${sourceBase}/` });
  const sourceNames = sourceFiles.map((f) => f.name).filter((n) => n.startsWith(`${sourceBase}/`));
  if (sourceNames.length === 0) throw new Error(`no objects found under ${sourceBase}/`);

  if (!args.dryRun) {
    // Copy everything under sourceBase/ to destBase/
    for (const srcName of sourceNames) {
      const rel = srcName.slice(`${sourceBase}/`.length);
      const dstName = `${destBase}/${rel}`;
      await bucket().file(srcName).copy(bucket().file(dstName));
    }
  }

  for (const name of requiredDst) await assertExistsGcsObject(name);

  const promotionDoc = {
    runId,
    env,
    siteId: args.siteId,
    articleId: args.articleId,
    runTag: args.runTag,
    runReason: args.runReason,
    requestedByUid: args.requestedByUid,
    sourceBase,
    destBase,
    dryRun: args.dryRun,
    force: args.force,
    override: args.override,
    overrideReason: args.override ? args.overrideReason : "",
    ticketId: args.override ? args.ticketId : "",
    approvedBy: args.override ? args.approvedBy : "",
    startedAt: startedAtIso,
    finishedAt: new Date().toISOString()
  };

  if (!args.dryRun) {
    await db().collection("packagePromotions").doc(runId).set(promotionDoc, { merge: true });
    await articleRef.set(
      {
        packagePath: destBase,
        packagePromotedAt: new Date(),
        packagePromotedFrom: {
          runTag: args.runTag,
          sourceBase,
          runReason: args.runReason,
          requestedByUid: args.requestedByUid,
          promotedAt: new Date().toISOString(),
          ...(args.override
            ? {
                override: true,
                overrideReason: args.overrideReason,
                ticketId: args.ticketId,
                approvedBy: args.approvedBy
              }
            : {})
        },
        // Convenience fields for ops queries/filters (provenance runTag remains untouched).
        promotedFromRunTag: args.runTag,
        env,
        lifecycle: "promoted",
        updatedAt: new Date()
      },
      { merge: true }
    );
  }

  logJson({
    ok: true,
    event: "package_promote_success",
    runId,
    env,
    siteId: args.siteId,
    articleId: args.articleId,
    runTag: args.runTag,
    runReason: args.runReason,
    sourceBase,
    destBase,
    dryRun: args.dryRun,
    force: args.force,
    override: args.override,
    articleRunTag: article.runTag ?? null
  });
}

run().catch((err: unknown) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        event: "package_promote_failed",
        error: String((err as { message?: string })?.message ?? err)
      },
      null,
      2
    )
  );
  process.exit(1);
});
