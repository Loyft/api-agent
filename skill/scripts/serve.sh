#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_run.sh
source "$DIR/_run.sh"
PORT="${API_AGENT_PORT:-8787}"
run_api_agent serve --port "$PORT"
