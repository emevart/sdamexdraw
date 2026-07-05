#!/bin/bash
# PostToolUse hook: auto-fix eslint on .ts/.tsx files after Write|Edit
input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // .tool_response.filePath' 2>/dev/null)
f="${f%$'\r'}"
if [[ "$f" == *.ts || "$f" == *.tsx ]]; then
  cd H:/excalidraw && npx eslint --fix "$f" 2>/dev/null || true
fi
