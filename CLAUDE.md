# CLAUDE.md

> **Last Updated:** 2026-05-20

SdamExDraw -- интерактивная доска для решения задач на sdamex.com. Публикуется как `@emevart/excalidraw` в GitHub Packages. Репо: `emevart/sdamexdraw`.

## О проекте

Форк Excalidraw (upstream tag: `v0.18.0`). Используется в основном проекте Billion Dollars как whiteboard для решения задач. С upstream НЕ синхронизируемся регулярно (cherry-pick критичных fix'ов вручную).

- **Активность:** низкая, форк стабилен. Возвращаемся когда нужны patches.
- **Основной репо:** `H:\billion-dollars` (whiteboard feature потребляет `@emevart/excalidraw`)
- **Upstream:** `excalidraw/excalidraw` (в upstream НЕ контрибьютим)

## Project Structure

Yarn workspaces monorepo:

- `packages/excalidraw/` -- основная React-библиотека, публикуется как `@emevart/excalidraw`. Подробности и customizations: `packages/excalidraw/CLAUDE.md`
- `packages/common/` -- shared constants/utils, ЙЦУКЕН patch. См. `packages/common/CLAUDE.md`
- `packages/element/`, `packages/math/`, `packages/utils/` -- internal, bundled в excalidraw (не публикуются отдельно)
- `excalidraw-app/` -- демо excalidraw.com **(НЕ используется в нашем флоу, НЕ трогать)**
- `e2e/` -- Playwright. См. `e2e/CLAUDE.md`

## Команды

```bash
yarn fix              # lint + format autofix (must pass 0 warnings)
yarn test:typecheck   # TypeScript type check
yarn build            # build all packages
yarn test             # Vitest unit (38/104 broken, см. e2e/CLAUDE.md)
yarn test:playwright  # e2e (manual, не в CI)
```

## Dev flow

1. Edit code в `packages/*`
2. `yarn fix` + `yarn test:typecheck` (обязательно)
3. Commit + push в `master`
4. CI `ci.yml` -- typecheck + build

## Release flow

См. `/publish` skill для пошагового workflow. Кратко:

1. Bump version в `packages/excalidraw/package.json`
2. Update `CHANGELOG.md` (без этого `/publish` warn'нёт через hook)
3. Commit + push master
4. `git tag v0.X.Y && git push --tags` -- `publish.yml` CI публикует автоматически
5. **Install в Billion Dollars:** `/install-in-billion` skill

## CI / Branch policy

- **`master` -- основная ветка** (не `main`). Force-push блокирован hooks + branch protection.
- **`ci.yml`** -- typecheck + build на push в master
- **`publish.yml`** -- npm publish на `v*` tag push
- **PRs (если нужны):** `gh pr create --repo emevart/sdamexdraw` (НЕ upstream)
- **Upstream sync:** см. `/sync-upstream` skill

## Skills

См. `.claude/SKILLS-INDEX.md`. Локально для форка:

- `/sync-upstream` -- merge upstream `excalidraw/excalidraw`
- `/publish` -- release `@emevart/excalidraw` (bump + tag + verify)
- `/install-in-billion` -- установка в основной репо

## Памятки

- **Tests:** 38/104 unit-тестов падают из-за кастомизаций (не в CI). Запуск: `NODE_OPTIONS="--max-old-space-size=8192" yarn test` на Windows.
- **Dev server stop перед `yarn add`** -- EPERM на `.node` файлы (Windows).
- **`npm ci` lock-sync** -- при install в Billion Dollars коммитим обе `package.json` и `package-lock.json`.
- **Russian layout** -- hotkeys работают через `getLatinKey()` proxy. См. `packages/common/CLAUDE.md`.
- **CI publish E403** -- `publish.yml` имеет `packages: write`, но GitHub org может блокировать `GITHUB_TOKEN`. Workaround: локальный `npm publish` с `~/.npmrc` token.

## Правила

- **NEVER эмодзи** -- маркеры: `[OK]`, `[!]`, `[FIX]`, `[BUG]`, `[X]`, `[WIP]`, `[TODO]`
- **CHANGELOG обновлять при каждом release** -- иначе `warn-publish-without-changelog.sh` сработает
- **НЕ деплоить вручную** -- только через `v*` tag push в master

## Окружение

- Windows 10, Git Bash основной, PowerShell доступен
- Yarn 1.22.22 (НЕ Yarn 4, НЕ Yarn Berry)
- Node.js 22+
- Origin: `emevart/sdamexdraw`, Upstream: `excalidraw/excalidraw`
