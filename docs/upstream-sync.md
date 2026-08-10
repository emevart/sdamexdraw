# Синхронизация с upstream: контрольные точки

> **Обновлено:** 2026-08-11

Форк намеренно расходится с `excalidraw/excalidraw` — полный merge не делаем
(см. `.claude/skills/sync-upstream/SKILL.md`). Этот файл — журнал разборов
upstream: что уже рассмотрено и с каким исходом. **Перед новой синхронизацией
читать таблицы ниже — коммиты из них повторно не разбирать.**

---

## Разбор 2026-08-10/11

**Точка отсчёта:** `upstream/master` = `c5a50d223` (2026-08-10, `fix(editor): respect boxSelectionMode ('contain' vs 'overlap') in lasso tool (#11862)`).

**Ветки:** `sync/upstream-2026-08` (этап 1) и `sync/upstream-2026-08-rename` (этап 2, включает этап 1).

### Сколько реально отставали

Наивный `git log HEAD..upstream/master` показывал **107** коммитов, но это счёт
по SHA — он не видит уже перенесённое. По patch-id и номерам PR:

| | Кол-во |
|---|---|
| Разница по SHA | 107 |
| Уже были у нас (patch-id совпал) | 20 |
| Уже были у нас (нашлись по номеру PR) | 10 |
| **Реально отсутствовали** | **77** |
| из них трогают `packages/` | 71 |
| из них только demo-app / docs / ci | 6 |

[!] Считать отставание только `git log` — ошибка, завышает почти в полтора раза.
Правильный инструмент — `git cherry master upstream/master` (сравнение по patch-id).

### Итог

| Исход | Кол-во |
|---|---|
| **Применено** | **37** из 71 |
| Конфликтуют, отложены | 34 |
| Пропущены осознанно (demo-app / docs / ci) | 6 |

Плюс три своих коммита: переименование файлов под upstream, импорт
`isNonDeletedElement` (#11660 принёс вызов без импорта) и снятие неиспользуемого
`getClientColor` (#11377).

### Проверки на ветке

| Гейт | Результат |
|---|---|
| `yarn test:typecheck` | [OK] чисто |
| `yarn build:packages` | [OK] чисто |
| `yarn test:code` | 4 ошибки — **предсуществующие**, ровно те же на `master` (`tests/rightButtonPanRace.test.tsx`, `import/first`) |
| `yarn test:app` (binding + history) | 76 failed / 10 passed / 88 против baseline на `master` 73 / 8 / 83 |

Регресса по тестам нет: прошедших стало больше (8 -> 10), а +3 падения — новые
тесты, приехавшие с upstream и рассчитанные на upstream-код, которого в форке нет.
Базовое состояние тестов красное и без нас; в CI они не входят (CI = typecheck + build).

### Этап 2: переименование файлов под upstream

Форк и upstream разошлись в именовании **четырёх** файлов (не десятков, как
казалось): `animated-trail.ts` -> `animatedTrail.ts`, `laser-trails.ts` ->
`laserTrails.ts`, `MobileToolBar.{tsx,scss}` -> `MobileToolbar.{tsx,scss}`.
Вместе с файлом upstream переименовал и сам компонент (`MobileToolBar` ->
`MobileToolbar`).

[!] **Переименование само по себе не разблокировало ни одного коммита** — повторный
проход после него дал 0 из 38. Гипотеза «конфликтует структура» оказалась неверной:
git и так распознавал переименование как rename. Реальный эффект был другой —
после переименования конфликт в ключевом коммите #11377 распался на четыре
однострочных конфликта в импортах вместо переплетения с rename, и его стало
возможно разобрать руками. А #11377 был блокером цепочки: он удаляет
`animation-frame-handler.ts` и переносит логику в `renderer/animation.ts`, откуда
`AnimationController.cancelScheduledFrame` нужен коммитам #11553 и #11562.

Итог этапа 2: **+6 коммитов** (#11377 вручную, затем #11553, #11562 и ещё три
следом). Переименование при этом всё равно полезно само по себе — оно убирает
постоянный источник шума в будущих синхронизациях.

[!] Две пары отличаются только регистром буквы (`ToolBar` -> `Toolbar`). На Windows
переименовывать в два шага через временное имя, иначе case-insensitive ФС теряет
изменение.

### Почему 34 всё ещё не легли

Наши кастомизации в горячих файлах. Топ конфликтных:
`App.tsx` (25 коммитов), `types.ts` (18), `LayerUI.tsx` (9), `actionCanvas.tsx` (9),
`index.tsx` (8), `css/styles.scss` (8). Это не механическая проблема — каждый такой
коммит требует ручного решения, что делать с нашей версией участка.

### Порядок применения имеет значение

Первый проход дал 20 чистых из 71. Повторный по оставшимся — **ещё 12**, третий — 0
(сходимость). Краш-фикс #11814 в первом проходе конфликтовал, во втором лёг чисто.
**Гонять проходы до сходимости**, не судить по одному прогону.

---

## Применено (37)

Все через `git cherry-pick -x`, то есть в сообщении каждого есть исходный upstream SHA.

| upstream SHA | Коммит |
|---|---|
| `53732f08f` | fix(editor): prevent eyedropper preview from overflowing viewport  (#11722) |
| `65aa577e3` | fix(editor): fix AnimationController scheduling race conds (#11678) |
| `aaa14e9df` | feat(editor): show cursor hint when switching arrow types (#11608) |
| `c070c8ffa` | fix(editor): improve scroll animation interpolation (#11562) |
| `e4c70cb6c` | feat(editor): AnimationController for scrollToContent (#11553) |
| `b42b1a193` | fix(editor): excessive battery usage (#11377) |
| `c5a50d223` | fix(editor): respect boxSelectionMode ('contain' vs 'overlap') in lasso tool (#11862) |
| `5e375b433` | fix(editor): do not flicker bbox when drag-creating line midpoint (#11834) |
| `46c42a6cb` | fix(editor): initialize selectedLinearElement after pasting arrows (#11803) |
| `f1aa8f86a` | feat(editor): disable arrowhead toggle via dblclick (#11822) |
| `786ab266f` | feat(editor): Error message for invalid hex color input (#11782) |
| `69d4c346c` | fix(editor): prevent esc from exiting fullscreen on macos when modal open (#11789) |
| `7c0b32957` | fix(editor): increase autoresize handle threshold until it hides (#11773) |
| `e6ae6bf05` | fix(editor): Diamond hit test shortcut (#11631) |
| `91b78903a` | fix(editor): Dangling deleted bound text (#11733) |
| `5cf547650` | fix(editor): make Help button tooltip consistent with toolbar (#11681) |
| `5776e1cc6` | fix(editor): should not select deleted bound text (#11660) |
| `082b2eeb1` | fix(editor): Hit cache soundness (#11630) |
| `ab0255f21` | fix(editor): prevent crash when editing arrow with bound text (#11814) |
| `3b9e1c07f` | fix(editor): Dragged arrow endpoint ignore grid and angle locks (#10972) |
| `adf963199` | fix(editor): keep multi-line bound text and container centered during alt resize (#11480) |
| `063e0256f` | fix(editor): arrow label rendering fixes and perf improvements (#11637) |
| `fbff83242` | fix(editor): Fix binding.test.ts type mismatch (#11633) |
| `8462bb81f` | fix(editor): Very small bindables can blow up fixedPoint -> position ratio (#11607) |
| `b2a729c40` | feat(editor): dblclick to toggle arrowhead (#11615) |
| `cce5001aa` | fix(editor): keep eraser shortcut consistent with tool switch rules (#11571) |
| `4ce70b815` | fix(editor): ensure canvas is cleared when background color is invalid to prevent ghosting (#11458) |
| `20f694d11` | fix(editor): prevent freeze from extremely large line elements (#11556) |
| `0642e72cf` | fix(editor): Arrows with text are rendered blurry in PNG export with larger scale (#11492) |
| `1cb9fff56` | fix(editor): Double history (#11445) |
| `069982606` | fix(editor): update `element.frameId` on frame change (#11490) |
| `b324a85ab` | fix(editor): elements duplicated when moving frame children (#11485) |
| `a83ac4885` | fix(editor): recalculate roundness type when switching shape types (#11473) |
| `0cf56b19c` | test(editor): add unit tests for BinaryHeap (#11419) |
| `61fe15a51` | fix(editor): cardinal direction arrows with label are invisible in exported SVG (#11441) |
| `b6d80e425` | fix(packages/excalidraw): consolidate bounds checks (#11275) |
| `337214927` | feat(packages/excalidraw): export applyDarkModeFilter and simplify (#11429) |

---

## Отложены: конфликт (34)

Не применялись. Причина — наши кастомизации в тех же участках (в основном `App.tsx`,
`types.ts`, `LayerUI.tsx`). Каждый требует ручного решения, механически не берутся.

| upstream SHA | Коммит |
|---|---|
| `647a264a4` | feat(packages/excalidraw): consolidate theme state handling (#11453) |
| `cd514d72d` | feat(editor): LaserPointer based freedraw (#11507) |
| `070df27e4` | fix(editor): Modern TS require imports from rootDir (#11552) |
| `51ca8abde` | feat(packages/excalidraw): viewport locking (#11554) |
| `5b0f5a4c2` | fix(editor): revert viewport animation back to 500ms (#11600) |
| `9357f98a9` | fix(editor): optimize UI rendering during animation (#11604) |
| `dd8296af1` | fix(editor): narrow `NonDeleted` type to `isDeleted: false` (#11470) |
| `ba0387d18` | chore(editor): Update translations from Crowdin (#10731) |
| `ed7c0c1d7` | chore(editor): Refactor Actions for clarity (#11632) |
| `339d3c373` | feat(editor): toolbar / active tool rewrites (#11649) |
| `d331bb49f` | fix(editor): avoid overlap of flowchart children (#11532) |
| `e9c856d26` | chore(editor): streamline getSelectedElementsByGroup (#11636) |
| `2423819ee` | feat(packages/excalidraw): interaction and UI control (#11605) |
| `acb48c3f4` | fix(editor): make embeddable ignore higher-z-index non-framelike elements (#11662) |
| `5ca083436` | feat(packages/excalidraw): add `props.activeTool` and related (#11665) |
| `374716304` | fix(editor): improve UX around locked animations (#11671) |
| `93dd51060` | feat(packages/excalidraw):  add `props.ui.enabled.zoom/scrollBackToContent` (#11677) |
| `a1d9b16b0` | fix(editor): show scroll-back-to-content button on mobile (#11680) |
| `a3b90897b` | fix(editor): Lost focus point on transition to inside-inside (#10964) |
| `f179f7ffd` | feat(editor): draw to shape (auto-detection) (#9313) |
| `b2e81e38a` | feat(editor): `autoshape` text + line improvements (#11752) |
| `1acf66eda` | feat(editor): bind text to hovered arrow endpoint (#11777) |
| `39103bd33` | chore(editor): Update translations from Crowdin (#11813) |
| `792ea3a06` | feat(editor): bucket fill (#11799) |
| `1da120e91` | fix(editor): include custom tools in pointer capture (#11826) |
| `c9c96f619` | fix(editor): normalize container + bound text order on restore (#11827) |
| `85270fcc8` | feat(packages/excalidraw): ViewportStatusFrame & factor out user-follow state (#11819) |
| `e33a1c0e8` | feat(packages/excalidraw): do not dedupe collaborators (#11835) |
| `74789584b` | feat(packages/excalidraw): support ViewportStatusFrame label onClick (#11838) |
| `1e22618ab` | fix(packages/excalidraw): viewportStatusFrame label offset on mobile (#11840) |
| `e4ab62673` | feat(packages/excalidraw): add `props.className` (#11839) |
| `219571a71` | fix(editor): viewportportStatusFrame UI fixes (#11841) |
| `4872083c0` | feat(editor): bucketfill cursor + eyedropper support (#11849) |
| `cf212b2f3` | feat(editor): eyedropper fixes and improvements (#11859) |

---

## Пропущены осознанно (6)

Не трогают `packages/` — только demo-приложение `excalidraw-app/`, docs или CI.
`excalidraw-app/` в нашем флоу не используется (`CLAUDE.md`: «НЕ трогать»).
**Повторно не разбирать.**

| upstream SHA | Коммит |
|---|---|
| `e18c1dd21` | Fix typo in Discord badge URL parameter (#11096) |
| `c08be6961` | ci(docker): fix docker dep bundling and pin remaining actions (#11398) |
| `28a9b1711` | test(repo): less noisy test output (#11505) |
| `f790bf7ab` | feat(editor): tweak sidebar promo style (#11181) |
| `344878b0b` | ci(repo): skip docs & example deployments in CI (#11674) |
| `ea7478744` | fix(app): remove ViewportStatusFrame debug (#11848) |

---

## Как повторять синхронизацию

```bash
git fetch upstream
git cherry master upstream/master > /tmp/cherry.txt   # '+' = нет у нас, '-' = уже есть
git checkout -b sync/upstream-<YYYY-MM> master
```

1. Отсеять коммиты, не трогающие `packages/`.
2. Вычесть всё, что уже перечислено в таблицах этого файла.
3. Гнать `git cherry-pick -x` в хронологическом порядке, конфликтные — `--abort` и в отложенные.
4. **Повторять проход по отложенным до сходимости** (порядок влияет).
5. Гейты: `yarn test:typecheck` + `yarn build:packages` обязательно; `yarn test:code` и
   `yarn test:app` сверять с baseline на `master`, а не с нулём.
6. Дописать новый раздел в этот файл.

[!] Грабли, пойманные 2026-08-10/11:
- `git cherry-pick --abort` падает с `Untracked working tree file ... would be overwritten`,
  если патч добавлял файл. Лечение: `git cherry-pick --quit && git reset --hard HEAD && git clean -fd packages/`.
- После неудачного abort в рабочем дереве остаются маркеры конфликта, и `tsc` сыпет
  `TS1185` в файлах, которых нет ни в одном коммите. Проверять `git status` перед тем,
  как верить typecheck.
- Cherry-pick может принести вызов без импорта (файл в форке разошёлся): так вышло с
  `isNonDeletedElement` из #11660 — поймал `tsc`.
- Разрешая конфликт «взять upstream целиком», проверять, не тащит ли это чужую логику
  поверх нашей кастомизации: так приехал `getClientColor`, хотя цвет лазера у нас
  намеренно единый.
