import { db } from "../lib/admin";

async function run() {
  const snap = await db().collection("sites").get();
  const ids = snap.docs.map((d) => d.id).sort();
  console.log(
    JSON.stringify(
      {
        ok: true,
        count: snap.size,
        ids
      },
      null,
      2
    )
  );
}

run().catch((err: unknown) => {
  console.error(String((err as { message?: string })?.message ?? err));
  process.exit(1);
});
