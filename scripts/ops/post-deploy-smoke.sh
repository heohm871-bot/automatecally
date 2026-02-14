#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

: "${OPS_SECRET:?missing OPS_SECRET (should match functions TASK_SECRET)}"
: "${OPS_SMOKE_SITE_ID:?missing OPS_SMOKE_SITE_ID (a siteId safe for ops smoke)}"

PROJECT_ID="${OPS_FIREBASE_PROJECT_ID:-blog-native-260212}"
REGION="${OPS_FUNCTIONS_REGION:-us-central1}"
BASE="https://${REGION}-${PROJECT_ID}.cloudfunctions.net"

SMOKE_URL="${OPS_SMOKE_URL:-${BASE}/opsSmoke?siteId=${OPS_SMOKE_SITE_ID}}"
HEALTH_URL="${OPS_FUNCTIONS_HEALTH_URL:-${BASE}/opsHealth}"

WEB_BASE_URL="${OPS_WEB_BASE_URL:-}"
WEB_HEALTH_URL="${OPS_WEB_HEALTH_URL:-${WEB_BASE_URL%/}/api/ops/health}"
WEB_TOKEN="${OPS_WEB_HEALTH_TOKEN:-}"

echo "[ops:post-deploy-smoke] project=${PROJECT_ID} region=${REGION}"
echo "[ops:post-deploy-smoke] smoke_url=${SMOKE_URL}"
echo "[ops:post-deploy-smoke] functions_health_url=${HEALTH_URL}"
echo "[ops:post-deploy-smoke] web_health_url=${WEB_HEALTH_URL}"

echo "[ops:post-deploy-smoke] 1) opsSmoke (dry-run + packaging + costDaily presence)"
SMOKE_RESP="$(curl -fSs -X POST "$SMOKE_URL" -H "X-Ops-Secret: ${OPS_SECRET}")"
node -e 'const r=JSON.parse(process.env.SMOKE_RESP||"{}"); if(!r.ok){console.error(r); process.exit(1);} console.log(JSON.stringify({ok:r.ok, runDate:r.runDate, siteId:r.siteId, articleId:r.articleId}, null, 2));' \
  SMOKE_RESP="$SMOKE_RESP"

echo "[ops:post-deploy-smoke] 2) functions opsHealth"
FN_HEALTH_RESP="$(curl -fSs "$HEALTH_URL" -H "X-Ops-Secret: ${OPS_SECRET}")"
node -e 'const r=JSON.parse(process.env.FN_HEALTH_RESP||"{}"); if(!r.ok){console.error(r); process.exit(1);} console.log(JSON.stringify({ok:r.ok, runDate:r.runDate, checks:r.checks}, null, 2));' \
  FN_HEALTH_RESP="$FN_HEALTH_RESP"

echo "[ops:post-deploy-smoke] 3) web /api/ops/health"
if [ -z "$WEB_BASE_URL" ] && [ -z "${OPS_WEB_HEALTH_URL:-}" ]; then
  echo "Missing OPS_WEB_BASE_URL (or OPS_WEB_HEALTH_URL)."
  exit 1
fi
if [ -z "$WEB_TOKEN" ]; then
  echo "Missing OPS_WEB_HEALTH_TOKEN."
  exit 1
fi

WEB_RESP="$(curl -fSs "$WEB_HEALTH_URL" -H "Authorization: Bearer ${WEB_TOKEN}")"
node -e 'const r=JSON.parse(process.env.WEB_RESP||"{}"); if(!r.ok){console.error(r); process.exit(1);} console.log(JSON.stringify({ok:r.ok, runDate:r.runDate, checks:r.checks}, null, 2));' \
  WEB_RESP="$WEB_RESP"

echo "[ops:post-deploy-smoke] OK"

