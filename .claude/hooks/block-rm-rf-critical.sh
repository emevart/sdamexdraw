#!/usr/bin/env bash
# Block `rm -rf` на критичных директориях форка.
# Fail-closed: if jq missing OR command targets ANY critical path, block.
# Fix bug_001: \s в bracket class [\s/] не expand'ится в Git Bash grep -- использовать POSIX.
# Fix bug_019: require non-alnum before `rm` (исключает substring в Form/warm/etc) + whitespace после (исключает rmdir).
set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "SAFETY: jq missing; cannot validate command. Install: https://jqlang.github.io/jq/" >&2; exit 2; }

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Critical paths форка: packages/, e2e/, scripts/, dev-docs/, docs/, .git, examples/
if echo "$COMMAND" | grep -qE '(^|[^[:alnum:]])rm[[:space:]]+.*[[:space:]/](\.git|packages|e2e|scripts|dev-docs|docs|examples|excalidraw-app|public)([[:space:]]|/|$)'; then
  echo "SAFETY: 'rm -rf' на критичных путях форка блокирован. Что хочешь удалить и зачем?" >&2
  exit 2
fi

# Allow-list (safe): node_modules, build artifacts
if echo "$COMMAND" | grep -qE '(^|[^[:alnum:]])rm[[:space:]]+.*[[:space:]/](node_modules|build|dist|test-results|coverage|\.next|\.turbo|/tmp/|tmp/)'; then
  exit 0
fi

exit 0
