#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/dev-env.sh"
cd "$ROOT_DIR"
if ! command -v node >/dev/null 2>&1; then
  echo "web-test.sh: node is required but was not found on PATH." >&2
  echo "Set CODEX_NODE_BIN=/path/to/node/bin or install Node.js." >&2
  exit 127
fi
exec node --test apps/web/src/*.test.js
