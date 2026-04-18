#!/usr/bin/env bash
# Resolve node from the user's PATH (handles nvm, homebrew, etc.)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/dist/index.js"
