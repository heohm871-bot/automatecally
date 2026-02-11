import { cleanupE2eFixture } from "./e2eFixture";

async function main() {
  const siteId = process.env.E2E_SITE_ID ?? "site-e2e";
  await cleanupE2eFixture({
    siteId,
    keywordId: process.env.E2E_KEYWORD_ID,
    tag: process.env.E2E_TAG
  });
  console.log(JSON.stringify({ ok: true, cleaned: { siteId } }, null, 2));
}

main().catch((err: unknown) => {
  console.error(String((err as { message?: string })?.message ?? err));
  process.exit(1);
});
