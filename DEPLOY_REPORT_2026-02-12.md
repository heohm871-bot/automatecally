# Deploy Report - February 12, 2026

## Scope
- Fixed Cloud Tasks dedupe/idempotency collision in `article_qa_fix` flow.
- Added safe handling for Cloud Tasks `ALREADY_EXISTS` on enqueue.
- Fixed image slot race condition so `top` slot is preserved during concurrent task writes.
- Added content bucket override support and configured runtime bucket.

## Key Changes
- `functions/src/lib/tasks.ts`
  - Added `ignoreAlreadyExists` option to `enqueueTask`.
  - Treats Cloud Tasks `ALREADY_EXISTS` as non-fatal when enabled.
- `functions/src/handlers/tasks/articleQa.ts`
  - `article_qa_fix` idempotency key now includes attempt:
    - `article_qa_fix:{siteId}:{articleId}:attempt-{n}`
  - Enabled `ignoreAlreadyExists` for downstream enqueues.
- `functions/src/handlers/tasks/articleQaFix.ts`
  - Re-qa enqueue key now includes fix attempt:
    - `article_qa:{siteId}:{articleId}:after-fix-{n}`
  - Enabled `ignoreAlreadyExists` for re-qa enqueue.
- `functions/src/handlers/tasks/imageGenerate.ts`
  - Preserves non-plan image slots (including `top`) to avoid overwrite during concurrent writes.
- `functions/src/lib/admin.ts`
  - Added `CONTENT_BUCKET` override for Storage target bucket.
- `functions/.env.blog-native-260212`
  - Added `CONTENT_BUCKET=blog-native-260212-assets` (runtime only; not committed).

## Verification
- New Cloud Tasks queues ensured: `light-queue`, `heavy-queue`.
- Full pipeline re-run with fresh runDate/keywordId completed.
- Verified terminal state:
  - `article_package`: success
  - `image_generate`: success
  - Article status: `packaged`
  - Image slots: `top`, `h2_1`, `h2_2`, `h2_3`, `h2_4` (count 5)

## Notes
- `.env` files remain ignored by git (`functions/.env*`).
