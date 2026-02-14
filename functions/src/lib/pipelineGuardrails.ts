import { db } from "./admin";

export type PipelineRunState = "running" | "succeeded" | "failed";

function pipelineRunId(siteId: string, runDate: string, pipelineVersion: string) {
  const s = String(siteId).trim();
  const d = String(runDate).trim();
  const v = String(pipelineVersion).trim() || "v1";
  return `${s}_${d}_${v}`.replace(/[^\w-]/g, "_").slice(0, 180);
}

export async function claimPipelineRun(args: {
  siteId: string;
  runDate: string;
  pipelineVersion: string;
  kind: "daily";
  traceId: string;
}) {
  const ref = db().doc(`pipelineRuns/${pipelineRunId(args.siteId, args.runDate, args.pipelineVersion)}`);
  const now = new Date();

  const claimed = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(
      ref,
      {
        kind: args.kind,
        siteId: args.siteId,
        runDate: args.runDate,
        pipelineVersion: args.pipelineVersion,
        traceId: args.traceId,
        state: "running" satisfies PipelineRunState,
        startedAt: now,
        updatedAt: now
      },
      { merge: true }
    );
    return true;
  });

  return { ref, claimed };
}

export async function finishPipelineRun(args: {
  refPath: string;
  state: PipelineRunState;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const ref = db().doc(args.refPath);
  await ref.set(
    {
      state: args.state,
      endedAt: new Date(),
      updatedAt: new Date(),
      ...(args.state === "failed"
        ? {
            lastErrorCode: args.errorCode ?? null,
            lastErrorMessage: args.errorMessage ?? null
          }
        : {})
    },
    { merge: true }
  );
}

