#!/usr/bin/env bash
# Run on the classroom server after `git pull`.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Node $(node -v)  npm $(npm -v)"
if [[ "$(node -p "process.versions.node.split('.')[0]")" -lt 20 ]]; then
  echo "Need Node.js 20+" >&2
  exit 1
fi

npm install
npm run build
node scripts/deploy-check.mjs --strict

echo
echo "Build is ready. Restart the service:"
echo "  sudo systemctl restart gradeforge"
echo "Health check (after nginx is up):"
echo "  curl -sS http://127.0.0.1/gradeforge/api/health"
