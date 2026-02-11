import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";

export async function acquireLock(siteId: string, lockId: string, ttlSec: number) {
  const ref = db().doc(`locks/${lockId}`);
  const now = Date.now();

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const expiresAtMs = snap.data()?.expiresAt?.toMillis?.() ?? 0;
      if (expiresAtMs > now) throw new Error("LOCKED");
    }
    tx.set(ref, {
      siteId,
      expiresAt: Timestamp.fromMillis(now + ttlSec * 1000),
      createdAt: Timestamp.now()
    });
  });
}

export async function releaseLock(lockId: string) {
  await db().doc(`locks/${lockId}`).delete().catch(() => {});
}
