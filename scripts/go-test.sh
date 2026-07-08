#!/usr/bin/env sh
set -eu

. "$(dirname -- "$0")/dev-env.sh"
cd "$ROOT_DIR/apps/api"
mkdir -p "$GOCACHE" "$GOMODCACHE"
if [ "$#" -eq 0 ]; then
  set -- ./...
fi
exec go test "$@"
