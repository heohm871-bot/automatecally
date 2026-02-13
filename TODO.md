# TODO

As of 2026-02-12.

## Paid Image Provider
- [ ] Replace `PAID_IMAGE_PROVIDER=placeholder` with a real provider integration (credentials, API client, rate limits, retries).
- [ ] Define expected fallback behavior when free image search fails (acceptance criteria + metrics/logging).

## QA Fix Workflow
- [ ] Add auto-correction for `missing_hashtags_12` in `article_qa_fix`.
- [ ] Review and document QA-fix retry policy (current behavior noted as delayed retry ~30 minutes).

## LLM Usage Caps
- [ ] Wire `llmUsage` counters/cap enforcement into the actual LLM call paths (currently scaffolding/flags only).
- [ ] Add reporting for `llmUsage` so caps are observable during operations.

## Infra And Ops
- [ ] Review `firebase-functions` upgrade path and address deploy warnings.
- [ ] Document Cloud Tasks queue config and environment differences (`dev` vs `staging` vs `prod`) in `infra/cloudtasks-queues.yaml`.
- [ ] Document Storage bucket strategy (default bucket vs `CONTENT_BUCKET` override).

## GitHub Push
- [ ] Fix local GitHub authentication/credentials (askpass/credential helper) and push branch `feat/pipeline-images-qa-fix`.

