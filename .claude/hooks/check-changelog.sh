#!/bin/bash
# PostToolUse hook: remind to update CHANGELOG.md after git commit
input=$(cat)
is_commit=$(echo "$input" | jq -r '.tool_input.command' 2>/dev/null | grep -c 'git commit')
if [ "$is_commit" -gt 0 ]; then
  has_changelog=$(echo "$input" | jq -r '.tool_response.stdout // ""' 2>/dev/null | grep -c 'CHANGELOG')
  if [ "$has_changelog" -eq 0 ]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"CHANGELOG.md not updated in this commit. Remind the user to update CHANGELOG.md."}}'
  fi
fi
