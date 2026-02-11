import { seedE2eFixture } from "./e2eFixture";

async function main() {
  const fixture = await seedE2eFixture({
    siteId: process.env.E2E_SITE_ID,
    keywordId: process.env.E2E_KEYWORD_ID,
    traceId: process.env.E2E_TRACE_ID,
    runDate: process.env.E2E_RUN_DATE,
    tag: process.env.E2E_TAG
  });
  console.log(JSON.stringify({ ok: true, fixture }, null, 2));
}

main().catch((err: unknown) => {
  console.error(String((err as { message?: string })?.message ?? err));
  process.exit(1);
});
