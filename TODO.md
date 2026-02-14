# TODO

As of 2026-02-14.

## Web Deploy (/ops in production)
- [ ] Confirm the actual web hosting target (recommended: Vercel) and make sure `/ops` is visible in production.
- [ ] Configure GitHub secrets for `.github/workflows/web-deploy-vercel.yml`:
  - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- [ ] Configure Vercel project env vars (`NEXT_PUBLIC_FIREBASE_*`) per `docs/runbooks/web-deploy.md`.

## runDate Standard (KST)
- [ ] Ensure ops users understand `runDate=KST` and always use KST dayKey for sanity checks.
- [ ] After budgets PR merge, confirm `/ops` defaults to KST today and does not show "0" incorrectly.

## Budgets / Alerts / Hard-Stop
- [ ] Set `settings/global.budgets` (dailyUsdTotal/perSite/thresholds/webhook).
- [ ] Validate runtime behavior:
  - >=80%: warning badge + optional webhook once
  - >=100%: LLM tasks skipped with `BUDGET_EXCEEDED`

## Cost Recompute / Backfill
- [ ] Dry-run recompute for a recent window before relying on aggregates:
  - `npm --prefix functions run cost:recompute -- --start=YYYY-MM-DD --end=YYYY-MM-DD`
- [ ] Apply recompute only after reviewing planned writes:
  - add `--dryRun=0`

## Paid Image Provider
- [ ] Replace `PAID_IMAGE_PROVIDER=placeholder` with a real provider integration (credentials, API client, rate limits, retries).
- [ ] Define expected fallback behavior when free image search fails (acceptance criteria + metrics/logging).

## QA Fix Workflow
- [ ] Add auto-correction for `missing_hashtags_12` in `article_qa_fix`.
- [ ] Review and document QA-fix retry policy (current behavior noted as delayed retry ~30 minutes).

## LLM Usage Caps
- [x] Wire cap enforcement into LLM paths (skips with `CAP_EXCEEDED`).
- [ ] Add optional reporting/alerts for caps usage (secondary; budgets is primary control).

## Infra And Ops
- [ ] Review `firebase-functions` upgrade path and address deploy warnings.
- [ ] Document Cloud Tasks queue config and environment differences (`dev` vs `staging` vs `prod`) in `infra/cloudtasks-queues.yaml`.
- [ ] Document Storage bucket strategy (default bucket vs `CONTENT_BUCKET` override).

## GitHub Push
- [ ] Fix local GitHub authentication/credentials (askpass/credential helper) and push branch `feat/pipeline-images-qa-fix`.
