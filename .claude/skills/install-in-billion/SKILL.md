---
name: install-in-billion
description: Установить новую версию `@emevart/excalidraw` в основной репо Billion Dollars и закоммитить.
disable-model-invocation: true
argument-hint: "<X.Y.Z>"
category: release
---

Установка опубликованной версии `@emevart/excalidraw` в Billion Dollars (`H:\billion-dollars\apps\frontend\`).

## Prereq

- Версия `<X.Y.Z>` уже опубликована в GitHub Packages (см. `/publish`)
- `NPM_TOKEN` доступен в окружении (founder обычно настроил)

## Steps

1. **Verify version published:**

   ```bash
   gh api /users/emevart/packages/npm/excalidraw/versions --jq '.[].name' | head -5
   ```

   `<X.Y.Z>` должен быть в списке.

2. **Switch к Billion Dollars frontend:**

   ```bash
   cd /h/billion-dollars/apps/frontend
   ```

3. **Stop dev server** (Windows EPERM на `.node` файлы):

   - Founder обычно сам останавливает -- спроси если непонятно

4. **Install:**

   ```bash
   NPM_TOKEN=<token> npm install @emevart/excalidraw@X.Y.Z
   ```

   Проверь что **обе** `package.json` и `package-lock.json` обновились -- `npm ci` требует sync.

5. **Verify build:**

   ```bash
   npm run typecheck
   npm run build
   ```

   Если ошибка -- проверь что новая версия экспортирует ожидаемые API (`ExcalidrawImperativeAPI`, `history.undo/redo` etc.).

6. **Smoke test locally:** запусти dev server (founder), открой страницу с whiteboard, проверь:

   - Toolbar рендерится
   - Hotkeys на русской раскладке работают
   - Touch undo (mobile, если есть устройство)
   - Highlighter / freedraw

7. **Commit:**

   ```bash
   git checkout -b chore/bump-excalidraw-X.Y.Z
   git add package.json package-lock.json
   git commit -m "chore(deps): bump @emevart/excalidraw to X.Y.Z"
   git push origin chore/bump-excalidraw-X.Y.Z
   ```

8. **PR develop → main:**

   ```bash
   gh pr create --base develop --title "chore(deps): bump @emevart/excalidraw to X.Y.Z" \
     --body "Release notes: см. https://github.com/emevart/sdamexdraw/blob/master/CHANGELOG.md"
   ```

9. После merge в develop -> PR develop → main (founder approve), staging deploy auto.

## Gotchas

- **EPERM на Windows** при `npm install` если dev server running.
- **`npm ci` lock-sync** -- ОБЯЗАТЕЛЬНО commit обе `package.json` И `package-lock.json`, иначе CI fail.
- **Cache-related issues** -- если `node_modules/.cache` stale, `rm -rf node_modules/.cache && npm install`.
- **NEXT*PUBLIC*\* envs** не влияют на excalidraw bundle (он client-only).
- **Whiteboard route -- `(app)/boards/`** в основном репо. Smoke test: `/boards/<code>` URL.
- **Если founder только что закончил `/publish`** -- скорее всего ему нужен этот skill дальше.
