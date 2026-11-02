#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/../.git" ]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  REPO_ROOT="$(pwd)"
fi

echo "==> Switching to branch claude/design-perf-security in $REPO_ROOT ..."
cd "$REPO_ROOT"
git checkout claude/design-perf-security || true

echo "==> Applying fixes to googleDriveService.ts, Memoriya.tsx, StoryMode.tsx, MemoryReel.tsx, mediaQueue.ts, storyMediaCache.ts ..."
python3 "$SCRIPT_DIR/apply_claude_branch_fixes.py" "$REPO_ROOT"

echo ""
echo "==> Git diff summary:"
git status -s

echo ""
echo "To commit and push these fixes, run:"
echo '  git commit -am "Fix Drive root count query, navigator.onLine sync deadlock, and preload StoryMode images"'
echo "  git push origin claude/design-perf-security"
