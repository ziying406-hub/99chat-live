#!/usr/bin/env sh
set -eu

. "$(dirname -- "$0")/dev-env.sh"
cd "$ROOT_DIR"
exec node --test apps/web/src/*.test.js
