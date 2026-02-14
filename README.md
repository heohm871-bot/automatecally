This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites

- Node.js **22** is required (CI and Firebase Functions runtime use Node 22).
- Local dev: `nvm use` (reads `.nvmrc`) or install Node 22 manually.
- If you see `npm WARN EBADENGINE`, you're likely running an older Node version.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Operations (Runbook)

Local verify (build + tests + firestore emulator e2e + web build):

```bash
npm run ops:verify
```

Production deploy (project alias `blog` from `.firebaserc`):

```bash
npm run ops:deploy:blog
```

Smoke checklist (manual, production auth varies):

```bash
npm run ops:smoke:blog
```

### GitHub Actions Secrets (Required for `ops-deploy-blog`)

These are **GitHub repo secrets** used by `.github/workflows/ops-deploy-blog.yml` post-deploy smoke.

- `OPS_SECRET`: must equal Firebase Functions `TASK_SECRET` (same value).
- `OPS_SMOKE_SITE_ID`: a safe `siteId` for smoke (it will create a small `articles/*` doc and run analyzer+package once).
- `OPS_WEB_BASE_URL`: base URL for the web admin (Vercel), e.g. `https://<your-domain>`.
- `OPS_WEB_HEALTH_TOKEN`: bearer token used by the smoke script to call `/api/ops/health`.

If any are missing, the workflow should fail with a clear message before deploy/smoke.

### Web Runtime Env (Vercel)

These are **Vercel env vars** for the web app (`apps/web`) health proxy endpoint.

- `OPS_HEALTH_TOKEN`: bearer token required by `GET /api/ops/health`.
  - Recommend setting this to the same value as GitHub secret `OPS_WEB_HEALTH_TOKEN`.
- `OPS_HEALTH_UPSTREAM_URL`: Firebase Functions `opsHealth` URL, e.g. `https://<region>-<project>.cloudfunctions.net/opsHealth`.
- `OPS_HEALTH_UPSTREAM_SECRET`: secret header value sent to upstream (`X-Ops-Secret`).
  - Must equal `OPS_SECRET` / Functions `TASK_SECRET`.

### Weekly Report Schema (Firestore)

`opsWeeklyReports/week_end_YYYY-MM-DD` (the `YYYY-MM-DD` is **KST** "yesterday" when the report runs; schedule: Mondays 10:15 KST)

- `window.startDayKey`, `window.endDayKey`, `window.days[]` (KST day keys)
- `pipeline.total`, `pipeline.succeeded`, `pipeline.failed`, `pipeline.successRate`
- `tasks.total`, `tasks.succeeded`, `tasks.failed`, `tasks.skipped`, `tasks.skippedRate`, `tasks.avgDurationMs`
- `cost.totalUsd`, `cost.deltaUsdVsPrev7d`, `cost.series[]` (`dayKey`, `estimatedCostUsd`, `llmCallCount`, `estimatedTokens`)

Web deploy (/ops 포함) runbook:

- `docs/runbooks/web-deploy.md`

Rollback (minimal)
- Revert the merge commit(s) in GitHub (new PR) and redeploy:
  - `firebase deploy --project blog --only functions,firestore:indexes`

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
