#!/usr/bin/env bash
# Block force push to master/main в форке.
# Fail-closed: if jq missing OR force push detected, block.
set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "SAFETY: jq missing; cannot validate command. Install: https://jqlang.github.io/jq/" >&2; exit 2; }

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Match git push with force flag targeting master/main
# Variants to catch:
#   git push --force origin master
#   git push -f origin master
#   git push --force-with-lease origin master
#   git push origin master --force
#   git push origin master -f
#   git push origin +master  (force via refspec)
#   git push --force  (current branch = master)
#   git push -f
if echo "$COMMAND" | grep -qE '(^|[^[:alnum:]])git[[:space:]]+push[[:space:]]'; then
  # is this a force push?
  if echo "$COMMAND" | grep -qE '(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$)|[[:space:]]\+master([[:space:]]|$)|[[:space:]]\+main([[:space:]]|$))'; then
    # is target master/main? (explicit OR implicit via current branch -- check both)
    if echo "$COMMAND" | grep -qE '[[:space:]](master|main)([[:space:]]|$)' \
      || echo "$COMMAND" | grep -qE '[[:space:]]\+(master|main)([[:space:]]|$)' \
      || ! echo "$COMMAND" | grep -qE 'git[[:space:]]+push[[:space:]]+\S+[[:space:]]+\S+'; then
      # либо явно master/main, либо bare `git push --force` (нет explicit branch -> current)
      echo "SAFETY: force-push на master блокирован. master = публичная история форка. Используй revert commit." >&2
      exit 2
    fi
  fi
fi

exit 0
