import { db } from "../lib/admin";

export type E2eFixture = {
  siteId: string;
  keywordId: string;
  traceId: string;
  runDate: string;
  tag: string;
};

export async function seedE2eFixture(overrides?: Partial<E2eFixture>) {
  const now = Date.now();
  const tag = overrides?.tag ?? `e2e-${now}`;
  const siteId = overrides?.siteId ?? "site-e2e";
  const keywordId = overrides?.keywordId ?? `kw-${now}`;
  const traceId = overrides?.traceId ?? `trace-${now}`;
  const runDate = overrides?.runDate ?? new Date().toISOString().slice(0, 10);

  await db().doc(`sites/${siteId}`).set(
    {
      name: "E2E Site",
      defaults: { banWords: [] },
      e2eTag: tag,
      createdAt: new Date()
    },
    { merge: true }
  );

  await db().doc(`keywords/${keywordId}`).set(
    {
      siteId,
      text: "테스트 키워드",
      trend3: 42,
      trend7: 38,
      trend30: 34,
      blogDocs: 18000,
      status: "candidate",
      e2eTag: tag,
      createdAt: new Date()
    },
    { merge: true }
  );

  return { siteId, keywordId, traceId, runDate, tag } satisfies E2eFixture;
}

export async function cleanupE2eFixture(input: { siteId: string; keywordId?: string; tag?: string }) {
  const { siteId, keywordId, tag } = input;

  const articles = await db().collection("articles").where("siteId", "==", siteId).limit(200).get();
  for (const doc of articles.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (keywordId && data.keywordId !== keywordId) continue;
    await doc.ref.delete();
  }

  if (keywordId) {
    await db().doc(`keywords/${keywordId}`).delete().catch(() => {});
  }

  if (tag) {
    const failures = await db().collection("taskFailures").where("siteId", "==", siteId).limit(200).get();
    for (const doc of failures.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (String(data.idempotencyKey ?? "").includes(tag) || data.traceId === tag) {
        await doc.ref.delete();
      }
    }
  }
}
