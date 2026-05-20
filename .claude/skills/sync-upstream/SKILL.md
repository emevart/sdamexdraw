---
name: sync-upstream
description: Merge upstream excalidraw/excalidraw в форк. Подходит для cherry-pick критичных fix'ов или major version bump.
disable-model-invocation: true
argument-hint: "[fetch|merge|cherry-pick <sha>|tag <upstream-tag>]"
category: dev
---

Sync с upstream `excalidraw/excalidraw`. Форк расходится с upstream намеренно -- merge'ить полностью НЕ нужно.

## Стратегия

Cherry-pick критичных upstream fix'ов (security, major bugs) **по одному**. Полный merge upstream branch не делаем -- скорее всего сломает наши 25 customizations.

## Modes

### `fetch` (default if no args)

```bash
git fetch upstream
git log upstream/master --oneline -20
```

Покажи последние 20 коммитов upstream, founder выберет что cherry-pick'нуть.

### `cherry-pick <sha>`

```bash
git checkout master
git cherry-pick <sha>
```

После cherry-pick:

1. Resolve conflicts если есть (форк customizations часто пересекаются с upstream)
2. `yarn fix && yarn test:typecheck`
3. Update `CHANGELOG.md` -- секция `[Unreleased]` или новой версии
4. Commit с conventional message: `feat: cherry-pick upstream <sha> -- <description>`
5. Push в master

### `tag <upstream-tag>`

Major bump (e.g. v0.18.0 -> v0.19.0). **Это рискованная операция.**

1. `git fetch upstream --tags`
2. `git diff upstream/master upstream/<tag>` -- посмотреть scope
3. **Создать backup branch:** `git checkout -b backup/before-sync-<tag>`
4. **Создать sync branch:** `git checkout -b sync/upstream-<tag>`
5. `git merge <tag>` (или cherry-pick по коммитам если изменений много)
6. Resolve все conflicts (наш `packages/excalidraw/CLAUDE.md` -- key files map, верифицируй каждый patch)
7. `yarn install && yarn fix && yarn test:typecheck`
8. **MANUAL TESTING:** запусти dev server, проверь все 25 customizations работают (особенно App.tsx-heavy: touch, hotkeys, freedraw)
9. PR `sync/upstream-<tag>` → master (для review через diff)
10. После merge -- bump major version (e.g. 0.26.x → 0.27.0), CHANGELOG, tag

### `merge` (full merge upstream/master)

**НЕ делать без явной founder approval.** Слишком много conflict potential. Используй `cherry-pick` или `tag`.

## После любого sync

- Проверь `packages/excalidraw/CLAUDE.md` -- не появились ли новые files, не сместились ли line numbers patches
- Если поломались patches -- обновляй CLAUDE.md и сразу
- `git push origin master` (master НЕ протектен от direct push в текущей политике)

## Gotchas

- **Upstream patch number может конфликтовать с нашими** в файлах: `App.tsx`, `Actions.tsx`, `MobileToolBar.tsx`, `LayerUI.tsx`, `appState.ts`. Эти файлы heavy-customized.
- **TS 5.7 ArrayBuffer** -- upstream может использовать `Uint8Array.buffer` без assertions, придётся добавлять.
- **`yarn install`** -- может обновить deps incompatibly (laser-pointer, react), проверь lock после merge.
- **`@excalidraw/laser-pointer`** -- наш custom dep, upstream его не знает. НЕ удалять при merge.
