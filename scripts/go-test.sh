#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/dev-env.sh"
cd "$ROOT_DIR/apps/api"
mkdir -p "$GOCACHE" "$GOMODCACHE"
if ! command -v go >/dev/null 2>&1; then
  echo "go-test.sh: go is required but was not found on PATH." >&2
  exit 127
fi
if [ "$#" -eq 0 ]; then
  set -- ./...
fi
exec go test "$@"
