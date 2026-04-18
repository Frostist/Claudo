#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Source nvm if present — handles the common macOS developer setup
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# Probe Homebrew locations if node is still not on PATH
if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin; do
    [ -x "$p/node" ] && export PATH="$p:$PATH" && break
  done
fi
exec node "$SCRIPT_DIR/dist/index.js" >> "$SCRIPT_DIR/server.log" 2>&1
