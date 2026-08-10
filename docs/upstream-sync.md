# Синхронизация с upstream: контрольные точки

> **Обновлено:** 2026-08-11

Форк намеренно расходится с `excalidraw/excalidraw` — полный merge не делаем
(см. `.claude/skills/sync-upstream/SKILL.md`). Этот файл — журнал разборов
upstream: что уже рассмотрено и с каким исходом. **Перед новой синхронизацией
читать таблицы ниже — коммиты из них повторно не разбирать.**

---

## Разбор 2026-08-10/11

**Точка отсчёта:** `upstream/master` = `c5a50d223` (2026-08-10, `fix(editor): respect boxSelectionMode ('contain' vs 'overlap') in lasso tool (#11862)`).

**Ветка:** `sync/upstream-2026-08-rename`.

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
| **Применено** | **43** из 71 |
| Отклонено с обоснованием | 28 |
| Пропущено (demo-app / docs / ci) | 6 |

Плюс свои коммиты: переименование файлов под upstream и три починки следов
ручного разбора (импорт `isNonDeletedElement`, снятие `getClientColor`,
уборка осиротевших импортов).

### Проверки

| Гейт | Результат |
|---|---|
| `yarn test:typecheck` | [OK] чисто |
| `yarn build:packages` | [OK] чисто |
| `yarn test:code` | 4 ошибки — **предсуществующие**, ровно те же на `master` (`tests/rightButtonPanRace.test.tsx`, `import/first`) |
| `yarn test:app` (binding + history) | 76 failed / 10 passed / 88 против baseline на `master` 73 / 8 / 83 |

Регресса нет: прошедших стало больше (8 -> 10), а +3 падения — новые тесты,
приехавшие с upstream и рассчитанные на upstream-код, которого в форке нет.

### Имена файлов приведены к upstream

`animated-trail.ts` -> `animatedTrail.ts`, `laser-trails.ts` -> `laserTrails.ts`,
`MobileToolBar.{tsx,scss}` -> `MobileToolbar.{tsx,scss}` (upstream переименовал и
сам компонент). Расхождений было **четыре**, а не десятки.

[!] Само переименование **не разблокировало ни одного коммита** автоматически —
проход после него дал 0 из 38. Гипотеза «конфликтует структура» неверна: git и так
распознавал rename. Польза оказалась косвенной: конфликт в #11377 распался на
однострочные в импортах, его удалось разобрать руками, а он был блокером цепочки
(даёт `cancelScheduledFrame` для #11553 и #11562). Переименование при этом снимает
постоянный источник шума в будущих синхронизациях — принято навсегда.

[!] Две пары отличались только регистром (`ToolBar` -> `Toolbar`). На Windows
переименовывать в два шага через временное имя, иначе case-insensitive ФС теряет
изменение.

### Порядок применения имеет значение

Первый проход дал 20 чистых из 71, повторный по оставшимся — ещё 12, третий — 0
(сходимость). Краш-фикс #11814 в первом проходе конфликтовал, во втором лёг чисто.
**Гонять проходы до сходимости**, не судить по одному прогону.

### Как разбирались конфликтные

Каждый оставшийся конфликт открывался руками. Рабочий приём — смотреть не на размер
патча, а на то, **где лежит суть фикса**: у #11827 конфликтовал только косметический
`actionGroup.tsx`, а сама починка порядка bound text была в `restore.ts` и легла чисто,
поэтому коммит принят с нашей версией кнопки. Обратный случай — #11600: конфликт
выглядел безобидным (CHANGELOG), но фикс правил `viewport.ts`, файла из непринятого
#11554, то есть чинил несуществующую у нас функциональность.

Ещё одна ловушка: «взять upstream целиком» тащит чужую логику поверх кастомизации.
Так приехал `getClientColor` — upstream красит лазерный след по участнику, а у нас
цвет намеренно единый.

---

## Применено (43)

Все через `git cherry-pick -x` — в сообщении каждого есть исходный upstream SHA.

| upstream SHA | Коммит |
|---|---|
| `acb48c3f4` | fix(editor): make embeddable ignore higher-z-index non-framelike elements (#11662) |
| `c9c96f619` | fix(editor): normalize container + bound text order on restore (#11827) |
| `e4ab62673` | feat(packages/excalidraw): add `props.className` (#11839) |
| `647a264a4` | feat(packages/excalidraw): consolidate theme state handling (#11453) |
| `a3b90897b` | fix(editor): Lost focus point on transition to inside-inside (#10964) |
| `070df27e4` | fix(editor): Modern TS require imports from rootDir (#11552) |
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

## Отклонено с обоснованием (28)

Разобраны поштучно. Это **решение, а не «не осилили»** — при следующей синхронизации
их не перебирать заново, если не изменилось основание (например, если решим завести
у себя viewport API или новый тулбар).

Сгруппировано по причинам:

| Причина | Кол-во |
|---|---|
| Новая фича рисования (bucket fill, eyedropper, freedraw, draw-to-shape, autoshape) — тянет файлы, которых в форке нет | 6 |
| Зависит от viewport API (#11554), который не принят | 6 |
| Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром | 4 |
| Новая UI-фича ViewportStatusFrame | 3 |
| chore-рефактор без функциональной пользы | 2 |
| Переводы Crowdin — у нас свои локали | 2 |
| Прочее (collab-модель, flowchart, цепочка привязок, типовой рефактор по 81 файлу) | 5 |

| upstream SHA | Коммит | Блоков | Почему отклонён |
|---|---|---|---|
| `4872083c0` | feat(editor): bucketfill cursor + eyedropper support (#11849) | 0 | Новая фича рисования; тянет файлы, которых в форке нет |
| `5b0f5a4c2` | fix(editor): revert viewport animation back to 500ms (#11600) | 1 | Зависит от viewport API (#11554), который не принят |
| `e9c856d26` | chore(editor): streamline getSelectedElementsByGroup (#11636) | 2 | chore-рефактор без функциональной пользы |
| `b2e81e38a` | feat(editor): `autoshape` text + line improvements (#11752) | 2 | Новая фича рисования; тянет файлы, которых в форке нет |
| `1da120e91` | fix(editor): include custom tools in pointer capture (#11826) | 2 | Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром |
| `51ca8abde` | feat(packages/excalidraw): viewport locking (#11554) | 2 | Зависит от viewport API (#11554), который не принят |
| `cf212b2f3` | feat(editor): eyedropper fixes and improvements (#11859) | 2 | Новая фича рисования; тянет файлы, которых в форке нет |
| `74789584b` | feat(packages/excalidraw): support ViewportStatusFrame label onClick (#11838) | 3 | Новая UI-фича ViewportStatusFrame, у нас отсутствует |
| `9357f98a9` | fix(editor): optimize UI rendering during animation (#11604) | 3 | Зависит от viewport API (#11554), который не принят |
| `1e22618ab` | fix(packages/excalidraw): viewportStatusFrame label offset on mobile (#11840) | 4 | Новая UI-фича ViewportStatusFrame, у нас отсутствует |
| `e33a1c0e8` | feat(packages/excalidraw): do not dedupe collaborators (#11835) | 5 | Collab-поведение; у нас своя модель присутствия |
| `d331bb49f` | fix(editor): avoid overlap of flowchart children (#11532) | 5 | Flowchart-фича, в нашем сценарии не используется |
| `a1d9b16b0` | fix(editor): show scroll-back-to-content button on mobile (#11680) | 5 | Зависит от viewport API (#11554), который не принят |
| `1acf66eda` | feat(editor): bind text to hovered arrow endpoint (#11777) | 6 | Зависит от непринятой цепочки привязок |
| `dd8296af1` | fix(editor): narrow `NonDeleted` type to `isDeleted: false` (#11470) | 6 | Типовой рефактор по 81 файлу — цена выше пользы |
| `cd514d72d` | feat(editor): LaserPointer based freedraw (#11507) | 7 | Новая фича рисования; тянет файлы, которых в форке нет |
| `ba0387d18` | chore(editor): Update translations from Crowdin (#10731) | 7 | Переводы Crowdin — у нас свои локали |
| `ed7c0c1d7` | chore(editor): Refactor Actions for clarity (#11632) | 8 | chore-рефактор без функциональной пользы |
| `85270fcc8` | feat(packages/excalidraw): ViewportStatusFrame & factor out user-follow state (#11819) | 9 | Новая UI-фича ViewportStatusFrame, у нас отсутствует |
| `219571a71` | fix(editor): viewportportStatusFrame UI fixes (#11841) | 15 | Конфликт с кастомизациями форка |
| `2423819ee` | feat(packages/excalidraw): interaction and UI control (#11605) | 18 | Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром |
| `792ea3a06` | feat(editor): bucket fill (#11799) | 19 | Новая фича рисования; тянет файлы, которых в форке нет |
| `93dd51060` | feat(packages/excalidraw):  add `props.ui.enabled.zoom/scrollBackToContent` (#11677) | 22 | Зависит от viewport API (#11554), который не принят |
| `f179f7ffd` | feat(editor): draw to shape (auto-detection) (#9313) | 24 | Новая фича рисования; тянет файлы, которых в форке нет |
| `339d3c373` | feat(editor): toolbar / active tool rewrites (#11649) | 32 | Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром |
| `5ca083436` | feat(packages/excalidraw): add `props.activeTool` and related (#11665) | 34 | Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром |
| `374716304` | fix(editor): improve UX around locked animations (#11671) | 45 | Зависит от viewport API (#11554), который не принят |
| `39103bd33` | chore(editor): Update translations from Crowdin (#11813) | 132 | Переводы Crowdin — у нас свои локали |

---

## Пропущены (6)

Не трогают `packages/` — только demo-приложение `excalidraw-app/`, docs или CI.
`excalidraw-app/` в нашем флоу не используется (`CLAUDE.md`: «НЕ трогать»).

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
5. Оставшиеся разбирать руками: сначала смотреть, **где суть коммита** — если она в
   файле, который лёг чисто, конфликт часто косметический и берётся наша сторона.
6. Гейты: `yarn test:typecheck` + `yarn build:packages` обязательно; `yarn test:code` и
   `yarn test:app` сверять с baseline на `master`, а не с нулём.
7. Дописать новый раздел в этот файл.

[!] Грабли, пойманные 2026-08-10/11:
- `git cherry-pick --abort` падает с `Untracked working tree file ... would be overwritten`,
  если патч добавлял файл. Лечение: `git cherry-pick --quit && git reset --hard HEAD && git clean -fd packages/`.
- После неудачного abort в рабочем дереве остаются маркеры конфликта, и `tsc` сыпет
  `TS1185` в файлах, которых нет ни в одном коммите. Проверять `git status` перед тем,
  как верить typecheck.
- Cherry-pick приносит вызов без импорта, если файл в форке разошёлся (`isNonDeletedElement`
  из #11660). Ловится только `tsc`.
- Разрешая «взять upstream целиком», проверять, не тащит ли это чужую логику поверх нашей
  кастомизации (`getClientColor`).
- `DU`-конфликт (файл удалён у нас, изменён у них) на пакете, которого в форке нет
  (`packages/laser-pointer`), разрешается `git update-index --force-remove`.
- После ручных резолвов проверять eslint на осиротевшие импорты — `--max-warnings=0`
  роняет сборку из-за одного unused-типа.
