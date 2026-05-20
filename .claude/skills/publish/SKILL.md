---
name: publish
description: Release `@emevart/excalidraw` -- version bump + CHANGELOG + tag push + verify CI publish.
disable-model-invocation: true
argument-hint: "[patch|minor|major|<X.Y.Z>] [--debug]"
category: release
---

Release flow для `@emevart/excalidraw`. CI делает publish автоматически на `v*` tag.

## Steps

1. **Verify branch + clean tree:**

   ```bash
   git checkout master
   git pull
   git status  # должно быть clean
   ```

2. **Determine version:**

   - Read `packages/excalidraw/package.json` -> current version
   - Args:
     - `patch` -> 0.26.77 -> 0.26.78
     - `minor` -> 0.26.77 -> 0.27.0
     - `major` -> 0.26.77 -> 1.0.0 (не делать без обсуждения)
     - `<X.Y.Z>` -> явный bump
     - `--debug` -> добавить `-debug.N` суффикс (debug-итерация)

3. **Pre-flight checks:**

   ```bash
   yarn fix              # 0 warnings обязательно
   yarn test:typecheck   # без errors
   yarn build            # успешная сборка
   ```

   Если что-то fail -- остановиться, не bump'ать.

4. **Bump version в `packages/excalidraw/package.json`:**

   - `"version": "X.Y.Z"`
   - Edit точечно (не yarn version -- yarn workspaces tricky)

5. **Update `CHANGELOG.md`:**

   - Добавить секцию `## [X.Y.Z] - YYYY-MM-DD` в начало (после header)
   - Перечислить изменения (groups: Added / Changed / Fixed / Removed)
   - Если debug -- одна строка `## [X.Y.Z-debug.N] - YYYY-MM-DD` с кратким описанием итерации

6. **Commit + push:**

   ```bash
   git add packages/excalidraw/package.json CHANGELOG.md
   git commit -m "chore(release): vX.Y.Z"
   git push origin master
   ```

7. **Tag + push:**

   ```bash
   git tag vX.Y.Z
   git push --tags
   ```

   CI `publish.yml` стартует автоматически.

8. **Verify CI:**

   ```bash
   gh run watch --repo emevart/sdamexdraw
   ```

   Дождаться зелёного. Если E403 (`packages: write` блок) -- fallback на manual publish (см. Fallback ниже).

9. **Verify в GitHub Packages:**

   ```bash
   gh api /users/emevart/packages/npm/excalidraw/versions --jq '.[0:3]'
   ```

10. **Notify:** скажи founder'у что версия `X.Y.Z` опубликована. Spросить: установить в Billion Dollars? Если да -> `/install-in-billion X.Y.Z`.

## Fallback: manual publish (если CI E403)

```bash
cd packages/excalidraw
yarn build
npm publish --registry=https://npm.pkg.github.com
```

Требует `~/.npmrc` с personal access token (founder уже настроил).

## Gotchas

- **CHANGELOG обязателен** -- `warn-publish-without-changelog.sh` сработает при `git tag v*` без свежей секции в CHANGELOG.md
- **Debug versions** -- `0.26.77-debug.1`, `-debug.2` etc. Финальная версия -- чистый bump без суффикса.
- **НЕ amend release commit** -- если что-то забыл, делай новый bump (patch).
- **НЕ force-push после tag push** -- упадёт hook (`block-force-push-master.sh`).
- **package-lock.json** -- gitignored в форке (см. `.gitignore`), не commit'ить.
