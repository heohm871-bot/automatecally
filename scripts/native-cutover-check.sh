#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <NEW_FIREBASE_PROJECT_ID>"
  exit 1
fi

PROJECT_ID="$1"

echo "[1/9] set gcloud project"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "[2/9] firebase use blog"
firebase use blog

echo "[3/9] sync prod firestore rules/indexes into base infra templates"
# This script deploys to the fixed Firebase project alias/id `blog` below.
# Make sure we never accidentally deploy dev/staging rules (which may be permissive).
INFRA_ENV=prod npm --prefix functions run rules:sync
INFRA_ENV=prod npm --prefix functions run indexes:sync

echo "[4/9] deploy firestore rules"
firebase deploy --only firestore:rules --project blog

echo "[5/9] deploy firestore indexes (native)"
firebase deploy --only firestore:indexes --project blog

echo "[6/9] deploy functions"
firebase deploy --only functions --project blog --force

echo "[7/9] verify Cloud Tasks queues"
gcloud tasks queues list --location=us-central1 --format="table(name,state)"

echo "[8/9] verify key collections exist (sample read)"
echo "  - llmCache / usageDaily are created lazily after first run"
echo "  - check with Firestore console after smoke run"

echo "[9/9] next commands"
cat <<'EOT'
firebase functions:secrets:set OPENAI_API_KEY --project blog
firebase functions:secrets:set TASK_SECRET --project blog
firebase deploy --only functions --project blog --force
npm --prefix functions run usage:report
EOT

echo "done"
