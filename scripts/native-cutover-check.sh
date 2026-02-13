#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <NEW_FIREBASE_PROJECT_ID>"
  exit 1
fi

PROJECT_ID="$1"

echo "[1/8] set gcloud project"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "[2/8] firebase use blog"
firebase use blog

echo "[3/8] deploy firestore rules"
firebase deploy --only firestore:rules --project blog

echo "[4/8] deploy firestore indexes (native)"
firebase deploy --only firestore:indexes --project blog

echo "[5/8] deploy functions"
firebase deploy --only functions --project blog --force

echo "[6/8] verify Cloud Tasks queues"
gcloud tasks queues list --location=us-central1 --format="table(name,state)"

echo "[7/8] verify key collections exist (sample read)"
echo "  - llmCache / usageDaily are created lazily after first run"
echo "  - check with Firestore console after smoke run"

echo "[8/8] next commands"
cat <<'EOT'
firebase functions:secrets:set OPENAI_API_KEY --project blog
firebase functions:secrets:set TASK_SECRET --project blog
firebase deploy --only functions --project blog --force
npm --prefix functions run usage:report
EOT

echo "done"
