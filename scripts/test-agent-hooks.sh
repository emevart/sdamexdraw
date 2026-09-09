#!/usr/bin/env bash
# Lightweight isolation regression for the advisory ESLint hook.
set -euo pipefail
command -v jq >/dev/null
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_root="$(cd -- "${TMPDIR:-/tmp}" && pwd -P)"
if command -v cygpath >/dev/null 2>&1; then tmp_root="$(cygpath -u "$(cygpath -m "$tmp_root")")"; fi
work="$(mktemp -d "$tmp_root/sdamexdraw-hook-test.XXXXXX")"
echo "Fixture (retained only on failure): $work"
# The fixture is owned by this invocation; retain it on failure for diagnosis.
repo="$work/Repo With Spaces"
mkdir -p "$repo/.claude/hooks" "$repo/node_modules/eslint/bin" "$work/bin" "$work/outside"
cp "$root/.claude/hooks/eslint-fix.sh" "$repo/.claude/hooks/eslint-fix.sh"
: > "$repo/node_modules/eslint/bin/eslint.js"
: > "$repo/example.ts"
: > "$work/outside/foreign.ts"
cat > "$work/bin/node" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$PWD" "$@" > "$HOOK_TEST_RECEIPT"
STUB
chmod +x "$work/bin/node"
export PATH="$work/bin:$PATH"
export HOOK_TEST_RECEIPT="$work/receipt"
run_hook() { jq -nc --arg file "$1" '{tool_input:{file_path:$file}}' | bash "$repo/.claude/hooks/eslint-fix.sh"; }
cd "$work/outside"
run_hook "$repo/example.ts"
grep -Fx "$repo" "$HOOK_TEST_RECEIPT" >/dev/null
grep -Fx "$repo/node_modules/eslint/bin/eslint.js" "$HOOK_TEST_RECEIPT" >/dev/null
grep -Fx "$repo/example.ts" "$HOOK_TEST_RECEIPT" >/dev/null
rm "$HOOK_TEST_RECEIPT"
run_hook "$work/outside/foreign.ts"
[[ ! -e "$HOOK_TEST_RECEIPT" ]]
run_hook "example.ts"
[[ -e "$HOOK_TEST_RECEIPT" ]]
rm "$HOOK_TEST_RECEIPT" "$repo/node_modules/eslint/bin/eslint.js"
run_hook "$repo/example.ts"
[[ ! -e "$HOOK_TEST_RECEIPT" ]]
for hook in "$root"/.claude/hooks/*.sh; do bash -n "$hook"; done
echo "PASS: checkout with spaces, foreign cwd, relative path, outside path, missing local ESLint, hook syntax"
# Validate the resolved absolute target before recursive removal on Windows too.
resolved_work="$(cd -- "$work" && pwd -P)"
if command -v cygpath >/dev/null 2>&1; then resolved_work="$(cygpath -u "$(cygpath -m "$resolved_work")")"; fi
case "$resolved_work" in
  "$tmp_root"/sdamexdraw-hook-test.*)
    [[ "$resolved_work" == "$work" && "$work" != "$tmp_root" ]] || exit 1
    rm -rf -- "$resolved_work"
    ;;
  *) echo "Refusing cleanup outside owned fixture: $resolved_work" >&2; exit 1 ;;
esac
echo "PASS: owned fixture removed"
