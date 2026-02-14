#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[ops:verify] functions build"
npm run build --prefix functions

echo "[ops:verify] functions test"
npm --prefix functions test

echo "[ops:verify] firestore emulator e2e (once)"
# Preflight requires TASK_SECRET even in inline mode.
firebase emulators:exec --only firestore --project demo-e2e \
  "bash -lc 'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 TASKS_EXECUTE_INLINE=1 TASK_SECRET=${TASK_SECRET:-ci-secret} E2E_SKIP_PUBLISH=1 npm run e2e:check:timeout --prefix functions'"

echo "[ops:verify] web build"
# next build can leave a lock while another build is running. Wait briefly instead of failing immediately.
LOCK_PATH="${ROOT_DIR}/apps/web/.next/lock"
for _ in $(seq 1 30); do
  if [ -f "$LOCK_PATH" ]; then
    sleep 1
    continue
  fi
  break
done
if [ -f "$LOCK_PATH" ]; then
  echo "[ops:verify] ERROR: ${LOCK_PATH} exists. Another next build may be running."
  exit 1
fi

npm run build --prefix apps/web

echo "[ops:verify] OK"
