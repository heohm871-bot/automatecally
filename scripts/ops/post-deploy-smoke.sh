#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${OPS_SECRET:-}" ]; then
  echo "Missing OPS_SECRET (should match Firebase Functions TASK_SECRET)."
  exit 1
fi
if [ -z "${OPS_SMOKE_SITE_ID:-}" ]; then
  echo "Missing OPS_SMOKE_SITE_ID (a siteId safe for ops smoke)."
  exit 1
fi

PROJECT_ID="${OPS_FIREBASE_PROJECT_ID:-blog-native-260212}"
REGION="${OPS_FUNCTIONS_REGION:-us-central1}"
BASE="https://${REGION}-${PROJECT_ID}.cloudfunctions.net"

SMOKE_URL="${OPS_SMOKE_URL:-${BASE}/opsSmoke?siteId=${OPS_SMOKE_SITE_ID}}"
HEALTH_URL="${OPS_FUNCTIONS_HEALTH_URL:-${BASE}/opsHealth}"

WEB_BASE_URL="${OPS_WEB_BASE_URL:-}"
WEB_HEALTH_URL="${OPS_WEB_HEALTH_URL:-${WEB_BASE_URL%/}/api/ops/health}"
WEB_TOKEN="${OPS_WEB_HEALTH_TOKEN:-}"

mask_sensitive() {
  local s="$1"
  if [ -n "${OPS_SECRET:-}" ]; then
    s="${s//${OPS_SECRET}/***}"
  fi
  if [ -n "${WEB_TOKEN:-}" ]; then
    s="${s//${WEB_TOKEN}/***}"
  fi
  printf "%s" "$s"
}

http_json() {
  # Usage: http_json METHOD URL HEADER1 HEADER2 ...
  # Prints: STATUS_CODE newline BODY
  local method="$1"
  local url="$2"
  shift 2
  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -sS -X "$method" "$url" "$@" -o "$tmp" -w "%{http_code}")" || {
    echo "000"
    cat "$tmp" 2>/dev/null || true
    rm -f "$tmp"
    return 0
  }
  echo "$code"
  cat "$tmp"
  rm -f "$tmp"
}

echo "[ops:post-deploy-smoke] project=${PROJECT_ID} region=${REGION}"
echo "[ops:post-deploy-smoke] smoke_url=${SMOKE_URL}"
echo "[ops:post-deploy-smoke] functions_health_url=${HEALTH_URL}"
echo "[ops:post-deploy-smoke] web_health_url=${WEB_HEALTH_URL}"

SMOKE_SITE_ID="${OPS_SMOKE_SITE_ID}"
SMOKE_RUNDATE=""
LAST_STEP=""

on_err() {
  local code="$?"
  echo "[ops:post-deploy-smoke] FAIL: step=${LAST_STEP} siteId=${SMOKE_SITE_ID} runDate=${SMOKE_RUNDATE}"
  # Best-effort: print opsHealth summary to speed up debugging.
  if [ -n "${HEALTH_URL:-}" ]; then
    echo "[ops:post-deploy-smoke] best-effort: fetch opsHealth summary"
    local raw code2 body2
    raw="$(http_json GET "$HEALTH_URL" -H "X-Ops-Secret: ${OPS_SECRET}")"
    code2="$(echo "$raw" | head -n 1)"
    body2="$(echo "$raw" | tail -n +2)"
    echo "[ops:post-deploy-smoke] opsHealth_status=${code2}"
    echo "[ops:post-deploy-smoke] opsHealth_body=$(mask_sensitive "$body2")"
  fi
  exit "$code"
}
trap on_err ERR

echo "[ops:post-deploy-smoke] 1) opsSmoke (dry-run + packaging + costDaily presence)"
LAST_STEP="opsSmoke"
echo "[ops:post-deploy-smoke] request: POST $SMOKE_URL"
SMOKE_RAW="$(http_json POST "$SMOKE_URL" -H "X-Ops-Secret: ${OPS_SECRET}")"
SMOKE_CODE="$(echo "$SMOKE_RAW" | head -n 1)"
SMOKE_BODY="$(echo "$SMOKE_RAW" | tail -n +2)"
echo "[ops:post-deploy-smoke] response_status=${SMOKE_CODE}"
echo "[ops:post-deploy-smoke] response_body=$(mask_sensitive "$SMOKE_BODY")"
if [ "$SMOKE_CODE" != "200" ]; then
  echo "[ops:post-deploy-smoke] opsSmoke non-200 status: ${SMOKE_CODE}"
  exit 1
fi
node -e '
  const raw=process.env.BODY||"{}";
  let r={};
  try{r=JSON.parse(raw);}catch(e){console.error({ok:false,error:"invalid_json",raw});process.exit(1);}
  if(!r.ok){console.error(r);process.exit(1);}
  console.log(JSON.stringify({ok:r.ok, runDate:r.runDate, siteId:r.siteId, articleId:r.articleId, traceId:r.traceId}, null, 2));
' BODY="$SMOKE_BODY"
SMOKE_RUNDATE="$(node -e 'try{const r=JSON.parse(process.env.BODY||"{}"); console.log(String(r.runDate||""));}catch{console.log("")}' BODY="$SMOKE_BODY")"
if [ -z "$SMOKE_RUNDATE" ]; then
  echo "[ops:post-deploy-smoke] WARNING: could not extract runDate from opsSmoke response"
fi
SMOKE_SITE_ID="$(node -e 'try{const r=JSON.parse(process.env.BODY||"{}"); console.log(String(r.siteId||process.env.FALLBACK||\"\"));}catch{console.log(process.env.FALLBACK||\"\")}' BODY="$SMOKE_BODY" FALLBACK="$SMOKE_SITE_ID")"

echo "[ops:post-deploy-smoke] 2) functions opsHealth"
LAST_STEP="functions_opsHealth"
echo "[ops:post-deploy-smoke] request: GET $HEALTH_URL"
FN_RAW="$(http_json GET "$HEALTH_URL" -H "X-Ops-Secret: ${OPS_SECRET}")"
FN_CODE="$(echo "$FN_RAW" | head -n 1)"
FN_BODY="$(echo "$FN_RAW" | tail -n +2)"
echo "[ops:post-deploy-smoke] response_status=${FN_CODE}"
echo "[ops:post-deploy-smoke] response_body=$(mask_sensitive "$FN_BODY")"
if [ "$FN_CODE" != "200" ]; then
  echo "[ops:post-deploy-smoke] opsHealth non-200 status: ${FN_CODE}"
  exit 1
fi
node -e '
  const raw=process.env.BODY||"{}";
  let r={};
  try{r=JSON.parse(raw);}catch(e){console.error({ok:false,error:"invalid_json",raw});process.exit(1);}
  const out={ok:r.ok, runDate:r.runDate, checks:r.checks, lastErrorCode:r.lastErrorCode??null, lastErrorMessage:r.lastErrorMessage??null};
  console.log(JSON.stringify(out, null, 2));
  if(!r.ok) process.exit(1);
' BODY="$FN_BODY" || {
  echo "[ops:post-deploy-smoke] FAIL: functions opsHealth (siteId=$SMOKE_SITE_ID runDate=$SMOKE_RUNDATE)"
  exit 1
}

echo "[ops:post-deploy-smoke] 3) web /api/ops/health"
LAST_STEP="web_api_ops_health"
if [ -z "$WEB_BASE_URL" ] && [ -z "${OPS_WEB_HEALTH_URL:-}" ]; then
  echo "Missing OPS_WEB_BASE_URL (or OPS_WEB_HEALTH_URL)."
  exit 1
fi
if [ -z "$WEB_TOKEN" ]; then
  echo "Missing OPS_WEB_HEALTH_TOKEN."
  exit 1
fi

echo "[ops:post-deploy-smoke] request: GET $WEB_HEALTH_URL"
WEB_RAW="$(http_json GET "$WEB_HEALTH_URL" -H "Authorization: Bearer ${WEB_TOKEN}")"
WEB_CODE="$(echo "$WEB_RAW" | head -n 1)"
WEB_BODY="$(echo "$WEB_RAW" | tail -n +2)"
echo "[ops:post-deploy-smoke] response_status=${WEB_CODE}"
echo "[ops:post-deploy-smoke] response_body=$(mask_sensitive "$WEB_BODY")"
if [ "$WEB_CODE" != "200" ]; then
  echo "[ops:post-deploy-smoke] web /api/ops/health non-200 status: ${WEB_CODE}"
  exit 1
fi
node -e '
  const raw=process.env.BODY||"{}";
  let r={};
  try{r=JSON.parse(raw);}catch(e){console.error({ok:false,error:"invalid_json",raw});process.exit(1);}
  const out={ok:r.ok, runDate:r.runDate, checks:r.checks, lastErrorCode:r.lastErrorCode??null, lastErrorMessage:r.lastErrorMessage??null};
  console.log(JSON.stringify(out, null, 2));
  if(!r.ok) process.exit(1);
' BODY="$WEB_BODY" || {
  echo "[ops:post-deploy-smoke] FAIL: web /api/ops/health (siteId=$SMOKE_SITE_ID runDate=$SMOKE_RUNDATE)"
  exit 1
}

echo "[ops:post-deploy-smoke] OK"
