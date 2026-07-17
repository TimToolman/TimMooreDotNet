#!/bin/bash
# SessionStart hook: prepare the Stow-a-way mobile app so a web session can
# immediately typecheck, bundle, or run it. The rest of the repo is a static
# site with no build step, so only stow-a-way/ needs dependencies.
set -euo pipefail

# Only needed in Claude Code on the web; skip on local machines.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

APP_DIR="${CLAUDE_PROJECT_DIR:-.}/stow-a-way"
[ -d "$APP_DIR" ] || exit 0

# Idempotent: skip the install if dependencies are already present (the
# container caches state after the hook, so re-runs stay fast).
if [ -d "$APP_DIR/node_modules/expo" ]; then
  echo "stow-a-way dependencies already installed."
  exit 0
fi

echo "Installing stow-a-way dependencies…"
cd "$APP_DIR"
npm install --no-audit --no-fund
echo "stow-a-way ready — run 'cd stow-a-way && npx expo start' or 'npm run typecheck'."
