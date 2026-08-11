# Синхронизация с upstream: контрольные точки

> **Обновлено:** 2026-08-12

Форк намеренно расходится с `excalidraw/excalidraw` — полный merge не делаем (см. `.claude/skills/sync-upstream/SKILL.md`). Этот файл — журнал разборов upstream: что уже рассмотрено и с каким исходом. **Перед новой синхронизацией читать таблицы ниже — коммиты из них повторно не разбирать.**

---

## Разбор 2026-08-12: волна 2 -- сужение `NonDeleted`

**Ветка:** `sync/upstream-2026-08-wave2`. Гейт волны 1 (живая приёмка жестов на iPad) пройден.

### Принято (2)

| upstream SHA | Коммит |
| --- | --- |
| `dd8296af1` | fix(editor): narrow `NonDeleted` type to `isDeleted: false` (#11470) |
| `e9c856d26` | chore(editor): streamline getSelectedElementsByGroup (#11636) |

Обе строки раньше стояли в таблице отклонённых («цена выше пользы» / «chore-рефактор») -- взяты сознательно: #11470 это инфраструктура, разблокирующая #11636 и #11777.

Итог: 82 файла, +924 / -589.

### [!] 11 отладочных `console.error` из #11470 вырезаны

Upstream добавил 11 логов вида `[NONDELETED][INVARIANT] ...` с комментарием «SAFETY: this should never happen». **У нас они срабатывали бы штатно:** в collab-сессии удалённый элемент живёт в сцене как тумбстоун (`isDeleted: true`), и путь через `getSelectedElements`/`restore`/`updateBoundElements` его законно встречает. У upstream в демо-приложении этого сценария нет, поэтому лог там и правда «никогда».

Снимался **весь гвард**, а не только строка лога -- иначе оставался пустой `if`, который валит `--max-warnings=0`. В четырёх файлах после этого осиротел импорт `isNonDeletedElement` (`duplicate.ts`, `textElement.ts`, `actionProperties.tsx`, `restore.ts`) -- снят.

### Ручные резолвы (5 конфликтов)

- `packages/excalidraw/tests/freedrawMode.test.tsx` -- `modify/delete`, файла в форке нет. `git update-index --force-remove` (приём из граблей прошлого прохода).
- `selection.ts` -- наш комментарий про импорт из барреля против пустоты upstream; взята наша сторона.
- `actionProperties.tsx` -- upstream тянул `StrokeVariability` из непринятого #11507. Проверка «сколько раз символ встречается в файле» разделила: `NonDeleted` + `NonDeletedExcalidrawElement` реально используются (7 мест), `StrokeVariability` -- только в самой строке импорта, отброшен.
- `arrows/focus.ts` -- взяты обе стороны (`FixedPointBinding` наш, `NonDeleted` приехал с патчем).
- `App.tsx`, два блока -- взята наша сторона: `iframeLikes` у нас типизирован `ExcalidrawIframeLikeElement`, потому что в него кладётся то, что прошло `isIframeLikeElement`; upstream-овский узкий `ExcalidrawIframeElement` уронил бы tsc. Второй блок -- наш гвард `!isIframeLikeElement(element)` из #11662.

### Хвосты сужения типа, которые поймал только tsc (3)

Сужение `NonDeleted<T>` до `isDeleted: false` разъехалось с нашим кодом в трёх местах `App.tsx`:

- `animateStraighten(element)` -- параметр сужен до `NonDeleted<ExcalidrawFreeDrawElement>`, каст на месте вызова обновлён. Аргумент и так `state.newElement`, то есть заведомо не удалён.
- `_handleWireframeVertexDrag` -- `this.scene.getElement()` отдаёт возможно-удалённый элемент, а `LinearElementEditor.movePoints` теперь его не принимает. В гвард добавлен `!isNonDeletedElement(element)`: тянуть вершину удалённого нечего, жест сбрасывается.

[!] Обе правки -- в нашем собственном коде (выпрямление freedraw, каркасные вершины), которого у upstream нет. **Цена сужения типа ложится не на портируемый патч, а на форковые фичи** -- это и есть та «цена выше пользы», из-за которой коммит откладывали. Оценивать её заранее по числу конфликтов нельзя: конфликтов было 5, а работы -- 5 резолвов плюс 3 невидимых до tsc хвоста.

### Гейты

| Гейт | Результат |
| --- | --- |
| `yarn test:typecheck` | [OK] чисто |
| `yarn build:packages` | [OK] чисто |
| `yarn test:code` (eslint `--max-warnings=0`) | [OK] чисто (было 4 ошибки -- их снял `9734c9a20`) |
| `yarn test:app` (binding + history) | 76 failed / 10 passed / 88 -- **ровно baseline `master`** |
| Тач-стенд (5 файлов) | 53/53 [OK], `tabletInputPolicy` 37/37 |

---

## Разбор 2026-08-11: волна viewport + разведка фич

**Точка отсчёта прежняя:** `upstream/master` = `c5a50d223`. **Ветка:** `sync/upstream-2026-08-features`.

Пересмотр части отклонённых 10.08 плюс предметный разбор фичевых кластеров.

### Принято (3 + 1 своя доработка)

| upstream SHA | Коммит                                                        |
| ------------ | ------------------------------------------------------------- |
| `51ca8abde`  | feat(packages/excalidraw): viewport locking (#11554)          |
| `5b0f5a4c2`  | fix(editor): revert viewport animation back to 500ms (#11600) |
| `9357f98a9`  | fix(editor): optimize UI rendering during animation (#11604)  |

Плюс свой коммит: сужение возврата `_renderInteractiveSceneInner` и `UIAppState` в нашем `gridSnap` — хвосты #11604, которые tsc поймал уже после cherry-pick.

**Гейты:** `test:typecheck` [OK], `build:packages` [OK], `test:code` — те же 4 предсуществующие ошибки (`rightButtonPanRace.test.tsx`, `import/first`), новых нет; `scrollConstraints.test.tsx` + `fitToContent.test.tsx` — 43/43 [OK]; baseline-набор binding + history — 76 failed / 10 passed / 88, ровно как на `master`.

**Ручные резолвы (3 конфликта в #11554 и #11604):**

- `App.tsx::removePointer` — взяты обе стороны: наша чистка pen-указателей плюс их `wasMultiTouchGesture` (обязательно ДО `gesture.pointers.delete`).
- `App.tsx::handleWheel` — их блок **не взят целиком**. Форк зумит на любом колесе, апстримной ветки `metaKey||ctrlKey` у нас нет. В нашу единую зум-ветку перенесены два фрагмента: ранний выход по `isViewportOverscrolled` и кламп `newZoom` под `lockZoom`. Гвард стоит ПОСЛЕ shift+колеса: панорамирование при перетянутом вьюпорте должно остаться — это единственный способ вернуться в бокс.
- `interactiveScene.ts` — сохранён наш гвард `|| !visibleElements` и try/catch, заменено только возвращаемое значение на `{}`.

### [!] Главное: «Зависит от viewport API» было авто-шаблоном, а не решением

В таблице отклонённых 10.08 шесть строк несли эту формулировку — **и одной из шести был сам #11554**. Проверка показала: #11554 даёт два конфликта, оба в нашем `handleWheel`/`removePointer`, а #11604 **вообще не зависит** от viewport API (`git show 9357f98a9 | grep -E "setViewport|viewport\.ts|scrollConstraints"` — пусто). Формулировка из журнала удалена; оставшиеся три строки переобоснованы поимённо.

**Урок:** причина отклонения, повторённая дословно в нескольких строках, — признак шаблона. Такие строки при следующем проходе перепроверять первыми.

### [X] #11507 LaserPointer freedraw — отклонён, и это важная ловушка

Разведка рекомендовала его как «кандидат номер один: дёшево, 0 конфликтов, прямо в наш сценарий». Проверка на коде дала обратное.

**Форк уже рисует freedraw через LaserPointer** — `getFreedrawOutlinePoints` в `packages/element/src/shape.ts` с собственной настройкой: soft-start на первых пяти точках против «сухого пера» Apple Pencil, `streamline: 0.45`, констатная ширина при `simulatePressure` (палец). То есть заявленная польза upstream — «constant width для аккуратного письма» — **у нас уже есть**, сделанная раньше и под iPad.

Upstream в #11507 идёт в другую сторону: возвращает `perfect-freehand` для режима variable и **удаляет `getFreedrawStrokeRadius`**, а эта функция у нас питает `bounds.ts` (3 места), hit-testing в `App.tsx:6305` и отдельный тест `freedrawBounds.test.ts`. Взятие коммита откатило бы нашу реализацию и сломало расчёт габаритов штриха.

Остаточная польза #11507 после вычета уже имеющегося: радио Constant/Variable в панели свойств, уполовиненная шкала толщин freedraw (0.5/1/2 вместо 1/2/4) и переименование `currentItemStrokeWidth` -> `currentItemStrokeWidthKey`, которое ломает потребителя. Соотношение не в пользу порта.

**Пересмотреть, если** upstream начнёт развивать freedraw дальше и расхождение станет дороже — тогда брать не коммит, а идею (поле `strokeOptions` поверх нашего рендерера).

[!] Заодно проверено и опровергнуто попутное утверждение: вендорить `packages/laser-pointer` не нужно. Исходники вендоренного пакета и npm `@excalidraw/laser-pointer@1.3.1` расходятся только форматированием (переносы prettier, порядок импортов, shorthand, `==`/`===`); публичный API совпадает полностью — 11 членов, расхождений в обе стороны ноль.

### [X] #9313 draw to shape — отклонён по существу, а не по цене

Распознаватель знает **пять форм: rectangle, diamond, ellipse, line, arrow. Треугольника нет.** Для доски, где решают планиметрию, это мимо главного сценария: наш собственный реестр — 33 инструмента, включая `triangle`, `rightTriangle`, пятиугольник, трапецию и 12 стереометрических тел.

Второе: распознанная фигура кладётся по сырому bbox, **мимо сетки** (во всём коммите одно упоминание grid, и то про привязку стрелок), а у нас `gridModeEnabled` захардкожен в `true` на стороне потребителя.

Третье: тулбарная часть завязана на `Tools.tsx`/`Toolbar.tsx` из отклонённого #11649; вписывать инструмент пришлось бы руками в наш `shapes.tsx`.

**Чего это стоит знать на будущее.** Ядро распознавания устроено просто — таблица прототипов на три скалярных признака и ближайший сосед с допуском:

```
rectangle: hullFillRatio 1,     cornerTurnShare 0.95, kurtosisProduct 1.83
diamond:   hullFillRatio 0.5,   cornerTurnShare 0.95, kurtosisProduct 3.24
ellipse:   hullFillRatio PI/4,  cornerTurnShare 0.55, kurtosisProduct 2.25
допуски: 0.2 / 0.2 / 0.7, максимальная дистанция 1.5
```

Добавить треугольник — одна строка, но **два признака из трёх у него вырождаются в ромб**: отношение площади выпуклой оболочки к bbox у треугольника ровно 0.5 (как у ромба), доля поворота на углах ~0.95 (как у ромба). Разделяет их только `kurtosisProduct`. То есть задача — не «дописать строку», а откалибровать четвёртый признак на реальных детских штрихах; стенд для этого готовый (`recognizeShape.test.ts`). **Это самостоятельная продуктовая задача, а не порт.**

### [X] #11799 bucket fill — отклонён

Реализация — **чистая геометрия, не растеризация**: планарный граф, разбиение на сегменты, обход граней, winding-правило; ноль вызовов `getContext`/`ImageData`. Качество и производительность поэтому хорошие. Но ядро — 1918 строк вычислительной геометрии (из 5513 строк коммита ~3066 приходится на тесты), а сценарий «закрасить сектор» для задачи ЕГЭ — украшение. Плюс новый инструмент в тулбаре -> та же зависимость от #11649.

### [DEFER] ViewportStatusFrame (#11819, #11838, #11840, #11841)

Прежняя формулировка «новая UI-фича, у нас отсутствует» неточна: `FollowMode` в форке **есть** (`components/FollowMode/FollowMode.tsx`), и #11819 — рефакторинг именно его. Цена ~23 хунка, самые неприятные в `MobileMenu.tsx` и `pointer-events` рядом с нашим `MobileToolbar`, плюс обязательная парная правка `use-yjs-follow.ts` в billion-dollars просто чтобы сохранить текущее поведение (иначе `requestUnfollow()` становится no-op). Брать целиком и одним релизом при следующем касании follow-режима.

### Что дальше (волна 2 — **СДЕЛАНА 12.08**, см. раздел выше)

`dd8296af1` (#11470, `NonDeleted` -> `isDeleted: false`, 81 файл) -> `e9c856d26` (#11636). Прямой пользы пользователю ноль; смысл — инфраструктура и разблокировка #11636/#11777.

[!] **Гейт перед волной 2 — живая приёмка волны 1 на iPad.** #11554 переписывает арифметику мультитач-пинча (математически тождественную при выключенном замке, но это единственное место, которое тестами не ловится), меняет способ измерения панелей (CSS-классы -> `data-viewport-ui`) и поднимает падинг 16 -> 24 px. Если запустить #11470 на 81 файл сразу следом, тач-регресс волны 1 утонет в шуме и его нельзя будет отбисектить.

### Грабли этого прохода

- **`git merge-tree` соврал.** Для #11507 он дал «0 маркеров конфликта», реальный cherry-pick дал 5 конфликтов. Симуляция слияния — оценка сверху по чистоте, не доказательство. Мерить только настоящим cherry-pick.
- **Перед cherry-pick коммита, который УДАЛЯЕТ файлы, проверять наш дрейф в них:** `git diff <sha>^ HEAD -- <удаляемый файл>`. Для #11554 (сносит `scene/scroll.ts` и `scroll.ts`) дрейф оказался нулевым, но молчаливая потеря правок здесь ничем бы себя не выдала.
- **Отчёт сабагента — гипотеза, а не факт.** Разведка по freedraw измерила конфликты и прочитала upstream-коммит, но не открыла наш `shape.ts` — и потому не увидела, что рекомендует откатить нашу же, более подходящую реализацию. Проверять «нашу сторону» кода до того, как поверить в дешевизну порта.

---

## Разбор 2026-08-10/11

**Точка отсчёта:** `upstream/master` = `c5a50d223` (2026-08-10, `fix(editor): respect boxSelectionMode ('contain' vs 'overlap') in lasso tool (#11862)`).

**Ветка:** `sync/upstream-2026-08-rename`.

### Сколько реально отставали

Наивный `git log HEAD..upstream/master` показывал **107** коммитов, но это счёт по SHA — он не видит уже перенесённое. По patch-id и номерам PR:

|                                       | Кол-во |
| ------------------------------------- | ------ |
| Разница по SHA                        | 107    |
| Уже были у нас (patch-id совпал)      | 20     |
| Уже были у нас (нашлись по номеру PR) | 10     |
| **Реально отсутствовали**             | **77** |
| из них трогают `packages/`            | 71     |
| из них только demo-app / docs / ci    | 6      |

[!] Считать отставание только `git log` — ошибка, завышает почти в полтора раза. Правильный инструмент — `git cherry master upstream/master` (сравнение по patch-id).

### Итог

| Исход                            | Кол-во       |
| -------------------------------- | ------------ |
| **Применено**                    | **43** из 71 |
| Отклонено с обоснованием         | 28           |
| Пропущено (demo-app / docs / ci) | 6            |

Плюс свои коммиты: переименование файлов под upstream и три починки следов ручного разбора (импорт `isNonDeletedElement`, снятие `getClientColor`, уборка осиротевших импортов).

### Проверки

| Гейт | Результат |
| --- | --- |
| `yarn test:typecheck` | [OK] чисто |
| `yarn build:packages` | [OK] чисто |
| `yarn test:code` | 4 ошибки — **предсуществующие**, ровно те же на `master` (`tests/rightButtonPanRace.test.tsx`, `import/first`) |
| `yarn test:app` (binding + history) | 76 failed / 10 passed / 88 против baseline на `master` 73 / 8 / 83 |

Регресса нет: прошедших стало больше (8 -> 10), а +3 падения — новые тесты, приехавшие с upstream и рассчитанные на upstream-код, которого в форке нет.

### Имена файлов приведены к upstream

`animated-trail.ts` -> `animatedTrail.ts`, `laser-trails.ts` -> `laserTrails.ts`, `MobileToolBar.{tsx,scss}` -> `MobileToolbar.{tsx,scss}` (upstream переименовал и сам компонент). Расхождений было **четыре**, а не десятки.

[!] Само переименование **не разблокировало ни одного коммита** автоматически — проход после него дал 0 из 38. Гипотеза «конфликтует структура» неверна: git и так распознавал rename. Польза оказалась косвенной: конфликт в #11377 распался на однострочные в импортах, его удалось разобрать руками, а он был блокером цепочки (даёт `cancelScheduledFrame` для #11553 и #11562). Переименование при этом снимает постоянный источник шума в будущих синхронизациях — принято навсегда.

[!] Две пары отличались только регистром (`ToolBar` -> `Toolbar`). На Windows переименовывать в два шага через временное имя, иначе case-insensitive ФС теряет изменение.

### Порядок применения имеет значение

Первый проход дал 20 чистых из 71, повторный по оставшимся — ещё 12, третий — 0 (сходимость). Краш-фикс #11814 в первом проходе конфликтовал, во втором лёг чисто. **Гонять проходы до сходимости**, не судить по одному прогону.

### Как разбирались конфликтные

Каждый оставшийся конфликт открывался руками. Рабочий приём — смотреть не на размер патча, а на то, **где лежит суть фикса**: у #11827 конфликтовал только косметический `actionGroup.tsx`, а сама починка порядка bound text была в `restore.ts` и легла чисто, поэтому коммит принят с нашей версией кнопки. Обратный случай — #11600: конфликт выглядел безобидным (CHANGELOG), но фикс правил `viewport.ts`, файла из непринятого #11554, то есть чинил несуществующую у нас функциональность.

Ещё одна ловушка: «взять upstream целиком» тащит чужую логику поверх кастомизации. Так приехал `getClientColor` — upstream красит лазерный след по участнику, а у нас цвет намеренно единый.

---

## Применено (43)

Все через `git cherry-pick -x` — в сообщении каждого есть исходный upstream SHA.

| upstream SHA | Коммит |
| --- | --- |
| `acb48c3f4` | fix(editor): make embeddable ignore higher-z-index non-framelike elements (#11662) |
| `c9c96f619` | fix(editor): normalize container + bound text order on restore (#11827) |
| `e4ab62673` | feat(packages/excalidraw): add `props.className` (#11839) |
| `647a264a4` | feat(packages/excalidraw): consolidate theme state handling (#11453) |
| `a3b90897b` | fix(editor): Lost focus point on transition to inside-inside (#10964) |
| `070df27e4` | fix(editor): Modern TS require imports from rootDir (#11552) |
| `53732f08f` | fix(editor): prevent eyedropper preview from overflowing viewport (#11722) |
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

## Отклонено с обоснованием (28 на 10.08, из них 5 позже приняты)

Разобраны поштучно. Это **решение, а не «не осилили»** — при следующей синхронизации их не перебирать заново, если не изменилось основание (например, если решим завести у себя viewport API или новый тулбар).

Число в заголовке — итог прохода 10.08 и не меняется задним числом. Строки, принятые позже, зачёркнуты и помечены датой: 3 в волне 1 (11.08), 2 в волне 2 (12.08). **Актуально отклонённых: 23.**

Сгруппировано по причинам:

| Причина | Кол-во |
| --- | --- |
| Новая фича рисования (bucket fill, eyedropper, freedraw, draw-to-shape, autoshape) — тянет файлы, которых в форке нет | 6 |
| Зависит от viewport API (#11554), который не принят | 6 |
| Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром | 4 |
| Новая UI-фича ViewportStatusFrame | 3 |
| chore-рефактор без функциональной пользы | 2 |
| Переводы Crowdin — у нас свои локали | 2 |
| Прочее (collab-модель, flowchart, цепочка привязок, типовой рефактор по 81 файлу) | 5 |

| upstream SHA | Коммит | Блоков | Почему отклонён |
| --- | --- | --- | --- |
| `4872083c0` | feat(editor): bucketfill cursor + eyedropper support (#11849) | 0 | Новая фича рисования; тянет файлы, которых в форке нет |
| ~~`5b0f5a4c2`~~ | ~~fix(editor): revert viewport animation back to 500ms (#11600)~~ |  | **ПРИНЯТ 11.08**, см. раздел ниже |
| ~~`e9c856d26`~~ | ~~chore(editor): streamline getSelectedElementsByGroup (#11636)~~ |  | **ПРИНЯТ 12.08** (волна 2) |
| `b2e81e38a` | feat(editor): `autoshape` text + line improvements (#11752) | 2 | Новая фича рисования; тянет файлы, которых в форке нет |
| `1da120e91` | fix(editor): include custom tools in pointer capture (#11826) | 2 | Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром |
| ~~`51ca8abde`~~ | ~~feat(packages/excalidraw): viewport locking (#11554)~~ |  | **ПРИНЯТ 11.08**, см. раздел ниже |
| `cf212b2f3` | feat(editor): eyedropper fixes and improvements (#11859) | 2 | Новая фича рисования; тянет файлы, которых в форке нет |
| `74789584b` | feat(packages/excalidraw): support ViewportStatusFrame label onClick (#11838) | 3 | Новая UI-фича ViewportStatusFrame, у нас отсутствует |
| ~~`9357f98a9`~~ | ~~fix(editor): optimize UI rendering during animation (#11604)~~ |  | **ПРИНЯТ 11.08.** Прежнее обоснование было прямо ложным: коммит вообще не упоминает `setViewport`/`viewport.ts`/`scrollConstraints` |
| `1e22618ab` | fix(packages/excalidraw): viewportStatusFrame label offset on mobile (#11840) | 4 | Новая UI-фича ViewportStatusFrame, у нас отсутствует |
| `e33a1c0e8` | feat(packages/excalidraw): do not dedupe collaborators (#11835) | 5 | Collab-поведение; у нас своя модель присутствия |
| `d331bb49f` | fix(editor): avoid overlap of flowchart children (#11532) | 5 | Flowchart-фича, в нашем сценарии не используется |
| `a1d9b16b0` | fix(editor): show scroll-back-to-content button on mobile (#11680) | 5 | **Обоснование переформулировано 11.08:** у нас нет этого бага. Upstream сломал кнопку сам в #11677, загейтив bottom bar на `defaultUIEnabled`; в нашем `MobileMenu.tsx` кнопка живёт без гейта, по `appState.scrolledOutside`. Применение = no-op плюс конфликт с сигнатурой нашего `MobileToolbar` |
| `1acf66eda` | feat(editor): bind text to hovered arrow endpoint (#11777) | 6 | Зависит от непринятой цепочки привязок |
| ~~`dd8296af1`~~ | ~~fix(editor): narrow `NonDeleted` type to `isDeleted: false` (#11470)~~ |  | **ПРИНЯТ 12.08** (волна 2). Оценка «цена выше пользы» подтвердилась в части цены: 5 резолвов + 3 хвоста, видимых только tsc, причём все три — в форковых фичах |
| `cd514d72d` | feat(editor): LaserPointer based freedraw (#11507) | 7 | Новая фича рисования; тянет файлы, которых в форке нет |
| `ba0387d18` | chore(editor): Update translations from Crowdin (#10731) | 7 | Переводы Crowdin — у нас свои локали |
| `ed7c0c1d7` | chore(editor): Refactor Actions for clarity (#11632) | 8 | chore-рефактор без функциональной пользы |
| `85270fcc8` | feat(packages/excalidraw): ViewportStatusFrame & factor out user-follow state (#11819) | 9 | Новая UI-фича ViewportStatusFrame, у нас отсутствует |
| `219571a71` | fix(editor): viewportportStatusFrame UI fixes (#11841) | 15 | Конфликт с кастомизациями форка |
| `2423819ee` | feat(packages/excalidraw): interaction and UI control (#11605) | 18 | Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром |
| `792ea3a06` | feat(editor): bucket fill (#11799) | 19 | Новая фича рисования; тянет файлы, которых в форке нет |
| `93dd51060` | feat(packages/excalidraw): add `props.ui.enabled.zoom/scrollBackToContent` (#11677) | 22 | **Обоснование переформулировано 11.08:** в форке нет `props.ui` вообще (`isDefaultUIEnabled`, `InteractionConfig`, `defaultUIEnabled` в LayerUI) — всё это заводит отклонённый #11605. Кнопка scroll-back-to-content у нас рендерится безусловно, API не нужен |
| `f179f7ffd` | feat(editor): draw to shape (auto-detection) (#9313) | 24 | Новая фича рисования; тянет файлы, которых в форке нет |
| `339d3c373` | feat(editor): toolbar / active tool rewrites (#11649) | 32 | Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром |
| `5ca083436` | feat(packages/excalidraw): add `props.activeTool` and related (#11665) | 34 | Переписывает публичный API и тулбар — конфликт с нашим кастомным тулбаром |
| `374716304` | fix(editor): improve UX around locked animations (#11671) | 45 | **Отложен, обоснование переформулировано 11.08:** требует `action.navigation` и `app.isInteractionEnabled()` из отклонённого #11605, сносит `scene/zoom.ts`, выносит 817 строк в `App.viewport.ts`. [!] Между #11554 (03.07) и #11671 (16.07) upstream ужал `viewport.ts` с 766 строк до ~330 — API ещё не застыл, мы осознанно зафиксировали промежуточное состояние |
| `39103bd33` | chore(editor): Update translations from Crowdin (#11813) | 132 | Переводы Crowdin — у нас свои локали |

---

## Пропущены (6)

Не трогают `packages/` — только demo-приложение `excalidraw-app/`, docs или CI. `excalidraw-app/` в нашем флоу не используется (`CLAUDE.md`: «НЕ трогать»).

| upstream SHA | Коммит |
| --- | --- |
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
5. Оставшиеся разбирать руками: сначала смотреть, **где суть коммита** — если она в файле, который лёг чисто, конфликт часто косметический и берётся наша сторона.
6. Гейты: `yarn test:typecheck` + `yarn build:packages` обязательно; `yarn test:code` и `yarn test:app` сверять с baseline на `master`, а не с нулём.
7. Дописать новый раздел в этот файл.

[!] Грабли, пойманные 2026-08-10/11:

- `git cherry-pick --abort` падает с `Untracked working tree file ... would be overwritten`, если патч добавлял файл. Лечение: `git cherry-pick --quit && git reset --hard HEAD && git clean -fd packages/`.
- После неудачного abort в рабочем дереве остаются маркеры конфликта, и `tsc` сыпет `TS1185` в файлах, которых нет ни в одном коммите. Проверять `git status` перед тем, как верить typecheck.
- Cherry-pick приносит вызов без импорта, если файл в форке разошёлся (`isNonDeletedElement` из #11660). Ловится только `tsc`.
- Разрешая «взять upstream целиком», проверять, не тащит ли это чужую логику поверх нашей кастомизации (`getClientColor`).
- `DU`-конфликт (файл удалён у нас, изменён у них) на пакете, которого в форке нет (`packages/laser-pointer`), разрешается `git update-index --force-remove`.
- После ручных резолвов проверять eslint на осиротевшие импорты — `--max-warnings=0` роняет сборку из-за одного unused-типа.
