import crypto from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../admin";

type CacheState = "ready" | "pending";

export type LlmCacheDoc = {
  state: CacheState;
  task: string;
  model: string;
  schemaVersion: string;
  promptVersion: string;
  request: unknown;
  response?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;
  leaseUntil?: FirebaseFirestore.Timestamp;
};

type ReserveDoc = {
  task: string;
  model: string;
  schemaVersion: string;
  promptVersion: string;
  request: unknown;
};

export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function makeCacheKey(params: {
  normalizedRequest: unknown;
  model: string;
  schemaVersion: string;
  promptVersion: string;
}): { hash: string; canonical: string } {
  const canonical = stableStringify({
    req: params.normalizedRequest,
    model: params.model,
    schemaVersion: params.schemaVersion,
    promptVersion: params.promptVersion
  });
  return { hash: sha256Hex(canonical), canonical };
}

export async function getOrReserveCache(hash: string, doc: ReserveDoc) {
  const ref = db().collection("llmCache").doc(hash);

  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const cur = snap.data() as LlmCacheDoc;
      if (cur.state === "ready" && cur.response) return { hit: true as const, ref, cur };

      const now = Timestamp.now();
      if (cur.state === "pending" && cur.leaseUntil && cur.leaseUntil.toMillis() > now.toMillis()) {
        const e = new Error("LLM_CACHE_PENDING");
        (e as Error & { retryAfterSec?: number }).retryAfterSec = 60;
        throw e;
      }
    }

    const now = Timestamp.now();
    tx.set(ref, {
      ...doc,
      state: "pending",
      leaseUntil: Timestamp.fromMillis(now.toMillis() + 2 * 60 * 1000),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    } satisfies LlmCacheDoc);

    return { hit: false as const, ref, cur: null };
  });
}

export async function commitCache(
  ref: FirebaseFirestore.DocumentReference,
  response: unknown,
  usage?: LlmCacheDoc["usage"],
  ttlDays = 30
) {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + ttlDays * 24 * 60 * 60 * 1000);

  await ref.set(
    {
      state: "ready",
      response,
      usage: usage ?? {},
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt,
      leaseUntil: FieldValue.delete()
    },
    { merge: true }
  );
}
