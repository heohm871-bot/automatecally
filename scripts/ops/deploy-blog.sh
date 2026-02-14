#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PROJECT_ALIAS="${PROJECT_ALIAS:-blog}"

echo "[ops:deploy:blog] Deploying to project alias: ${PROJECT_ALIAS}"
firebase deploy --project "$PROJECT_ALIAS" --only functions,firestore:indexes

echo "[ops:deploy:blog] OK"

