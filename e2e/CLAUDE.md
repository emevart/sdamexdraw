# e2e -- Fork test conventions

> Loaded automatically when Claude works in `e2e/`.

Playwright визуальные тесты. **НЕ в CI** -- запускаем manually перед release.

## Команды

```bash
yarn test:playwright              # все e2e тесты
yarn test:playwright --update-snapshots   # пересоздать snapshots (после UI change)
```

## Windows specifics

- **`NODE_OPTIONS="--max-old-space-size=8192"`** -- иначе OOM при snapshot diff
- **`yarn test:playwright --workers=2`** -- иначе CPU 100% / hangs (Windows)

## Что покрыто

- Toolbar rendering (compact / mobile)
- Shape presets render
- Freedraw rendering visual diff
- Minimap layout

## Что НЕ покрыто (известные)

- Touch events (Playwright требует special setup для multi-touch)
- LaserPointer rendering (perfect-freehand → laser-pointer migration не покрыт snapshot'ами)
- Highlighter mode toggle interactions

## Vitest unit tests

`yarn test` -- 38/104 файлов падают из-за кастомизаций форка (preset rendering, polygon guards). **Не в CI.** Запускать только при больших изменениях.

## Gotchas

- **Snapshot drift на Windows vs CI** -- font rendering subtle differences, иногда нужны platform-specific snapshots (`--config` flag)
- **`test-results/`** gitignored, но local artifacts могут заполнить диск -- периодически `rm -rf test-results/`
- **Когда обновляешь snapshots** -- обязательно commit с описанием what changed visually + screenshots в PR description
