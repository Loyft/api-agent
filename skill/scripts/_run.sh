#!/usr/bin/env bash
# Resolve api-agent CLI: prefer PATH, then repo via pnpm/tsx.
# Intended to be sourced by other scripts in this directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

run_api_agent() {
  if command -v api-agent >/dev/null 2>&1; then
    api-agent "$@"
  elif [[ -x "$ROOT/node_modules/.bin/tsx" ]]; then
    "$ROOT/node_modules/.bin/tsx" "$ROOT/src/cli.ts" "$@"
  else
    echo '{"error":{"code":"cli_not_found","message":"Install deps in api-agent repo (pnpm install) or add api-agent to PATH."}}' >&2
    exit 1
  fi
}
