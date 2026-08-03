#!/usr/bin/env bash
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${AGENT_SKILLS_HOME:-$HOME/.agents/skills}"
TARGET="$TARGET_ROOT/importing-artifacts-through-gateway"
mkdir -p "$TARGET_ROOT"
rm -rf "$TARGET"
cp -R "$SOURCE_DIR" "$TARGET"
printf 'Installed to %s\n' "$TARGET"
