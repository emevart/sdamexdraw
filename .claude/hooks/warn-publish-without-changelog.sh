#!/usr/bin/env bash
# Warn если `git tag v*` или `git push --tags` без свежей CHANGELOG записи.
# Exit 0 with warning -- не блокирует, только предупреждает (founder может игнорировать).
set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "SAFETY: jq missing; cannot warn about CHANGELOG. Install: https://jqlang.github.io/jq/" >&2; exit 0; }

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Detect tag/release commands
is_tag_or_push_tags=false
if echo "$COMMAND" | grep -qE '(^|[^[:alnum:]])git[[:space:]]+tag[[:space:]]+v[0-9]+\.'; then
  is_tag_or_push_tags=true
fi
if echo "$COMMAND" | grep -qE '(^|[^[:alnum:]])git[[:space:]]+push[[:space:]].*--tags'; then
  is_tag_or_push_tags=true
fi

if [ "$is_tag_or_push_tags" = "false" ]; then
  exit 0
fi

# Check CHANGELOG.md был modified в последнем commit (HEAD)
CHANGELOG_PATH="${CLAUDE_PROJECT_DIR:-.}/CHANGELOG.md"
if [ ! -f "$CHANGELOG_PATH" ]; then
  echo "WARN: CHANGELOG.md не найден -- release без changelog? Founder, проверь." >&2
  exit 0
fi

# Был ли CHANGELOG.md в последнем commit?
if ! git -C "${CLAUDE_PROJECT_DIR:-.}" log -1 --name-only --pretty=format:'' 2>/dev/null | grep -q '^CHANGELOG\.md$'; then
  echo "WARN: создаёшь tag/push --tags без обновления CHANGELOG.md в последнем коммите. Если это release -- сначала bump + changelog (см. /publish skill)." >&2
fi

exit 0
