#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" != "" ]; then
  export GOOGLE_API_KEY="$1"
fi

# Source nvm if present — handles the common macOS developer setup
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# Probe Homebrew locations if node is still not on PATH
if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin; do
    [ -x "$p/node" ] && export PATH="$p:$PATH" && break
  done
fi
# Kill any leftover server from a previous run
lsof -ti:9876 | xargs kill -9 2>/dev/null || true

# Ensure dist/ reflects latest src/ changes (Godot launches dist/index.js)
echo "[Start] Building server..." >> "$SCRIPT_DIR/server.log"
npm --prefix "$SCRIPT_DIR" run build >> "$SCRIPT_DIR/server.log" 2>&1
echo "[Start] Build complete." >> "$SCRIPT_DIR/server.log"

exec node "$SCRIPT_DIR/dist/index.js" >> "$SCRIPT_DIR/server.log" 2>&1
