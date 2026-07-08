#!/usr/bin/env sh

# Shared local test/runtime helpers for this repo.
# Source this file before running Go or Node-based checks in this workspace.

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

export GOCACHE="${GOCACHE:-$ROOT_DIR/.gocache}"
export GOMODCACHE="${GOMODCACHE:-$ROOT_DIR/.gomodcache}"

CODEX_NODE_BIN="${CODEX_NODE_BIN:-/Users/ying/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin}"
if [ -d "$CODEX_NODE_BIN" ]; then
  case ":$PATH:" in
    *":$CODEX_NODE_BIN:"*) ;;
    *) export PATH="$CODEX_NODE_BIN:$PATH" ;;
  esac
fi
