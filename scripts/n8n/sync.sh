#!/usr/bin/env bash
# Wrapper for scripts/n8n/sync.mjs.
# Forwards all args, exits with the same code.
set -euo pipefail
HERE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
exec node "$HERE/sync.mjs" "$@"
