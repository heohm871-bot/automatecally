## Summary (copy/paste)
- Adds Firebase Functions ops endpoints: `opsHealth` and `opsSmoke` (protected by `TASK_SECRET`).
- Adds Web `/api/ops/health` endpoint (token-protected) that proxies `opsHealth`.
- Adds `opsWeeklyReport` scheduled job (Mondays 10:15 KST) -> `opsWeeklyReports/week_end_YYYY-MM-DD`.
- Adds post-deploy smoke to `ops-deploy-blog` workflow (fails the run if smoke fails).
- Adds a reusable smoke runner script: `scripts/ops/post-deploy-smoke.sh`.

## Smoke Checks
- [ ] `POST /opsSmoke`: runs 1 dry-run task + packaging + verifies `costDaily/{runDate(KST)}` exists
- [ ] `GET /opsHealth`: Firestore connectivity
- [ ] `GET /opsHealth`: queue latency (max age among recent queued taskRuns)
- [ ] `GET /opsHealth`: last pipeline success timestamp
- [ ] `GET /api/ops/health` (web): upstream proxy works + same check fields

## Troubleshooting (run in this order)
1. GitHub Actions logs: find which step failed in `Post-deploy smoke (prod)` and which sub-step (`opsSmoke` / `opsHealth` / `web /api/ops/health`).
2. Functions first:
   - `GET https://<region>-<project>.cloudfunctions.net/opsHealth` with header `X-Ops-Secret: <TASK_SECRET>`
   - If `ok=false`, check `lastErrorCode/lastErrorMessage` and `checks.*`.
3. Smoke runner:
   - `POST https://<region>-<project>.cloudfunctions.net/opsSmoke?siteId=<siteId>` with `X-Ops-Secret: <TASK_SECRET>`
   - Validate `runDate` is KST and `costDailyExists=true`.
4. Web proxy:
   - `GET https://<your-web>/api/ops/health` with `Authorization: Bearer <OPS_HEALTH_TOKEN>`
   - If this fails but functions is OK: verify Vercel env vars `OPS_HEALTH_UPSTREAM_URL/OPS_HEALTH_UPSTREAM_SECRET`.

## Ops Apply Steps (SSOT)
1. GitHub repo secrets (Actions):
   - `OPS_SECRET` (must equal Functions `TASK_SECRET`)
   - `OPS_SMOKE_SITE_ID` (safe siteId for smoke)
   - `OPS_WEB_BASE_URL` (e.g. `https://<your-vercel-domain>`)
   - `OPS_WEB_HEALTH_TOKEN` (must equal web env `OPS_HEALTH_TOKEN`)
2. Vercel project env vars (Web runtime):
   - `OPS_HEALTH_TOKEN` (Bearer token for `/api/ops/health`)
   - `OPS_HEALTH_UPSTREAM_URL` (Functions `opsHealth` URL)
   - `OPS_HEALTH_UPSTREAM_SECRET` (same value as `OPS_SECRET` / Functions `TASK_SECRET`)

