#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_run.sh
source "$DIR/_run.sh"
if [[ $# -lt 1 ]]; then
  echo '{"error":{"code":"invalid_request","message":"Usage: docs.sh <site-slug> [--openapi]"}}' >&2
  exit 1
fi
run_api_agent docs "$@"
