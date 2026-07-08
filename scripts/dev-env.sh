#!/usr/bin/env sh

# Shared local test/runtime helpers for this repo.

ROOT_DIR="${ROOT_DIR:-$(CDPATH= cd -- "$(pwd)" && pwd)}"

export GOCACHE="${GOCACHE:-$ROOT_DIR/.gocache}"
export GOMODCACHE="${GOMODCACHE:-$ROOT_DIR/.gomodcache}"

CODEX_NODE_BIN="${CODEX_NODE_BIN:-/Users/ying/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin}"
if [ -d "$CODEX_NODE_BIN" ]; then
  case ":$PATH:" in
    *":$CODEX_NODE_BIN:"*) ;;
    *) export PATH="$CODEX_NODE_BIN:$PATH" ;;
  esac
fi
