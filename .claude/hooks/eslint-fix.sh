#!/usr/bin/env bash
# Advisory autofix: only this checkout and its installed ESLint.
set -u
command -v jq >/dev/null 2>&1 || { echo "eslint-fix: jq missing; autofix not run" >&2; exit 0; }
input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
f="${f%$'\r'}"
case "$f" in *.ts|*.tsx) ;; *) exit 0 ;; esac
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)" || exit 0
if command -v cygpath >/dev/null 2>&1; then
  repo_root="$(cygpath -u "$(cygpath -m "$repo_root")")"
  f="$(cygpath -u "$f")"
fi
case "$f" in /*|[A-Za-z]:* ) ;; *) f="$repo_root/$f" ;; esac
f="$(realpath -m -- "$f")" || exit 0
case "$f" in "$repo_root"/*) ;; *) echo "eslint-fix: outside this checkout; skipped" >&2; exit 0 ;; esac
eslint="$repo_root/node_modules/eslint/bin/eslint.js"
if [[ ! -f "$eslint" ]]; then
  echo "eslint-fix: local ESLint missing; autofix not run" >&2
  exit 0
fi
cd -- "$repo_root" || exit 0
node "$eslint" --fix "$f" || echo "eslint-fix: failed; run the required lint gate" >&2
