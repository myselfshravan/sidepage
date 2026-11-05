#!/usr/bin/env bash
# Fails if tracked files contain credentials or a real .env file is tracked.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
tracked_env=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' || true)
if [[ -n "$tracked_env" ]]; then
  echo "check-secrets: .env files are tracked:"; echo "$tracked_env"; fail=1
fi

patterns='-----BEGIN (RSA |EC )?PRIVATE KEY-----|"type": *"service_account"|AIza[0-9A-Za-z_-]{35}|re_[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{36}|sk-[A-Za-z0-9]{32,}|phc_[0-9A-Za-z]{30,}'
if git ls-files -z | xargs -0 grep -nIE "$patterns" -- 2>/dev/null | grep -v '^scripts/check-secrets.sh:'; then
  echo "check-secrets: possible secret found in tracked files (above)."; fail=1
fi

exit $fail
