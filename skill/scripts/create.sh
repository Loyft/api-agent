#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_run.sh
source "$DIR/_run.sh"
if [[ $# -lt 2 ]]; then
  echo '{"error":{"code":"invalid_request","message":"Usage: create.sh <url> <task> [--name slug] [--interact query]"}}' >&2
  exit 1
fi
URL="$1"
TASK="$2"
shift 2
run_api_agent create "$URL" --task "$TASK" "$@"
