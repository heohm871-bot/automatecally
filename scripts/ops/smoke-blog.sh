#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PROJECT_ALIAS="${PROJECT_ALIAS:-blog}"

cat <<EOF
[ops:smoke:blog] Manual smoke checklist (project alias: ${PROJECT_ALIAS})

1) Run a single pipeline end-to-end (console / scheduled run).
2) Firestore checks:
   - taskRuns/*: verify new runs are written with state/attemptCount/lastErrorCode (if failed)
   - pipelineRuns/*: verify daily claims exist (siteId+runDate+pV)
   - articles/*: verify status=packaged and internalLinks[] exists (3~4 or 0~2 ok)
3) Web admin:
   - /ops loads and shows today's taskRuns for a siteId (filters work)

Notes:
- This script intentionally avoids accessing Firestore directly because production auth varies.
EOF

