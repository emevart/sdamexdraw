---
name: install-in-billion
description: Установить новую версию `@emevart/excalidraw` в основной репо Billion Dollars и закоммитить.
disable-model-invocation: true
argument-hint: "<X.Y.Z>"
category: release
---

Установка опубликованной версии `@emevart/excalidraw` в Billion Dollars (`H:\billion-dollars\apps\frontend\`).

## [!] Ставим тарболом из бакета, а не из GitHub Packages

С 0.29.0 зависимость в `apps/frontend/package.json` -- прямой URL:

```
"@emevart/excalidraw": "https://storage.yandexcloud.net/sdamex-npm-artifacts/emevart-excalidraw-X.Y.Z.tgz"
```

Почему: GitHub Packages для приватного npm требует токен **на каждой машине, которая ставит зависимости** -- локально, в CI и внутри Docker-сборки фронтенда. Бакет с анонимным чтением снимает это со всех трёх разом. `/publish` всё равно публикует и в GitHub Packages -- это остаётся источником версий и историей, но потребитель ходит в бакет.

## Steps

1. **Проверить, что версия опубликована:**

   ```bash
   gh api users/emevart/packages/npm/excalidraw/versions --jq '.[0:3] | .[] | .name'
   ```

   [!] Без ведущего слэша -- Git Bash переписывает `/users/...` в путь на диске и `gh` падает с `invalid API endpoint`.

2. **Собрать тарбол** (в форке, на `master` с уже запушенным тегом):

   ```bash
   cd packages/excalidraw
   npm pack --pack-destination <scratchpad>
   ```

   Имя получится `emevart-excalidraw-X.Y.Z.tgz`. `npm pack` печатает `integrity: sha512-...` -- запомнить, пригодится в шаге 4.

3. **Залить в бакет:**

   ```bash
   yc config profile activate billion-dollars        # НЕ -staging: у того нет прав на бакет
   yc storage s3api put-object \
     --bucket sdamex-npm-artifacts \
     --key emevart-excalidraw-X.Y.Z.tgz \
     --body <scratchpad>/emevart-excalidraw-X.Y.Z.tgz
   yc config profile activate billion-dollars-actions-staging   # вернуть профиль обратно
   ```

4. **Обязательно: скачать обратно и сверить.**

   ```bash
   curl -sSL -o <scratchpad>/roundtrip.tgz \
     https://storage.yandexcloud.net/sdamex-npm-artifacts/emevart-excalidraw-X.Y.Z.tgz
   openssl dgst -sha512 -binary <scratchpad>/roundtrip.tgz | openssl base64 -A
   cmp <scratchpad>/emevart-excalidraw-X.Y.Z.tgz <scratchpad>/roundtrip.tgz
   ```

   Хэш обязан совпасть с тем, что напечатал `npm pack`. Битая или недозалитая раздача проявилась бы уже как невоспроизводимая ошибка `npm ci` в CI или в Docker-сборке -- то есть далеко от причины.

5. **Правка версии + install:**

   ```bash
   cd /h/billion-dollars/apps/frontend
   sed -i 's|emevart-excalidraw-<СТАРАЯ>.tgz|emevart-excalidraw-X.Y.Z.tgz|g' package.json
   npm install
   ```

   Токен не нужен -- бакет отдаёт анонимно. Проверить, что обновились **обе** `package.json` и `package-lock.json`: `npm ci` требует их синхронности.

6. **Гейты:**

   ```bash
   npm run typecheck
   npm run build
   ```

   [!] Первым делом смотреть `typecheck`: релизы форка, меняющие публичные типы (например 0.30.0 -- сужение `NonDeleted` до `isDeleted: false`), ломаются именно здесь и только здесь.

7. **Commit + PR в `develop`:**

   ```bash
   git checkout -b chore/bump-excalidraw-X.Y.Z
   git add apps/frontend/package.json apps/frontend/package-lock.json
   git commit -m "chore(deps): bump @emevart/excalidraw to X.Y.Z"
   git push origin chore/bump-excalidraw-X.Y.Z
   gh pr create --base develop --title "chore(deps): bump @emevart/excalidraw to X.Y.Z"
   ```

8. После merge в `develop` -> поезд `develop -> main` -> staging авто. **Прод-тег делает founder вручную.**

## Gotchas

- **Параллельная сессия.** `H:\billion-dollars` -- общий чекаут. Перед `git checkout` посмотреть `git branch --show-current`: если там чужая ветка, работать в worktree либо вернуть и ветку, **и `node_modules`** (после `npm install` там останется новая версия, а чужой `package.json` будет ждать старую -- расхождение молчаливое).
- **EPERM на Windows** при `npm install`, если поднят dev-сервер.
- **`npm ci` lock-sync** -- коммитить ОБЕ `package.json` и `package-lock.json`, иначе CI падает.
- **Whiteboard route -- `(app)/boards/`**. Смоук: `/boards/<code>`.
- **Живая приёмка тач-жестов -- только на устройстве.** Зелёные тесты её не заменяют (`docs/touch-gestures.md`).
- Если stale-кэш: `rm -rf node_modules/.cache && npm install`.
