import { getDefaultGlobalSettings, seedDefaultGlobalSettings } from "../lib/globalSettings";

async function run() {
  const seeded = await seedDefaultGlobalSettings();
  console.log(
    JSON.stringify(
      {
        ok: true,
        path: "settings/global",
        seeded,
        defaults: getDefaultGlobalSettings()
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
