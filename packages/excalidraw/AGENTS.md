# packages/excalidraw -- Fork conventions

> Применяются корневые AGENTS.md; правила общие для Claude/Codex.

Основная React-библиотека форка, публикуется как `@emevart/excalidraw`.

## Key files map

| Файл | Что внутри |
| --- | --- |
| `components/App.tsx` | Главный component, contains большинство patches |
| `components/LayerUI.tsx` | Top-level UI (toolbar, sidebar, footer) -- hamburger preferences |
| `components/Actions.tsx` | Action bar properties panel -- compact mode logic |
| `components/MobileToolBar.tsx` | Mobile toolbar -- presets, dropdowns positioning |
| `components/Minimap.tsx` + `.scss` | Кастомный минимап |
| `components/StrokeWidthRange.tsx` | Discrete range slider (замена 3 radio) |
| `components/Tooltip.tsx` + `ToolButton.tsx` | Custom tooltips (заменили native `title=`) |
| `renderer/interactiveScene.ts` | Render crash protection (try-catch) |
| `actions/actionLinearEditor.tsx` | Linear editor safety |
| `actions/actionToggleGridSnap.tsx` | Grid snap toggle action |
| `actions/actionProperties.tsx` | StrokeWidth slider + highlighter modes |
| `shapePresets/solidFactory.ts` | Wireframe presets, draggable cone apex, triangular prism edges |
| `straighten.ts` | Hold-to-straighten Procreate-style |
| `types.ts` | ExcalidrawImperativeAPI surface (undo/redo, настройки инструментов) |
| `appState.ts` | gridSnap, three toolSettings sets |
| `locales/ru-RU.json` | Полный русский (vetted) |
| `css/styles.scss` | Zoom controls alignment, editor padding |

## Fork customizations (grouped)

### UI / Layout

- **Compact styles panel forced** -- non-phone devices (`packages/common/src/editorInterface.ts` → `deriveStylesPanelMode`)
- **Preferences в hamburger menu** -- grid toggle, grid snap, others (`LayerUI.tsx`); переключатели, значение которых задаёт prop хоста (`gridModeEnabled`, `viewModeEnabled`), скрыты, их горячие клавиши молчат и не показываются в справке (`HelpDialog.tsx`), кнопки выхода из режима просмотра на телефоне при prop нет, Alt+S не выключает сетку из prop, «Привязка к сетке» видна по эффективной сетке (#5069)
- **Custom tooltips** -- replaced native `title=` с `<Tooltip>` (400ms, 11px, Apple Pencil hover support)
- **Canvas background TopPicks visible в compact** (`ColorPicker.tsx`)
- **Confirm dialog never fullscreen в compact/phone** (`ConfirmDialog.scss`)
- **Zoom controls alignment** -- `--editor-container-padding` (`css/styles.scss`)
- **Eight resize handles on every device** -- n/s/e/w ручки рисуются на компьютере, планшете и телефоне (#3042; iPad по просьбе founder 26.09); планшет по-прежнему тянет и за полосу у стороны. Средние ручки скрываются, если сторона на экране короче `MIDDLE_HANDLES_MIN_SIDE_PX` = 44 CSS px, один порог для отрисовки и попадания. Где зоны попадания перекрываются (палец: 28 px, поворот в 16 px над средней верхней), побеждает ручка с ближайшим центром, при равенстве — первая по порядку, как у upstream (`packages/element/src/transformHandles.ts` → `getOmitSidesForEditorInterface`, `getTransformHandlesFromCoords`; `resizeTest.ts` → `getNearestTransformHandleAt`; `tests/transformHandlesSides.test.ts`)

### Mobile

- **All 14 shape presets в SHAPE_TOOLS** (`MobileToolBar.tsx`)
- **Extra tools dropdown opens upward** (`side="top"`, `DropdownMenuContent.tsx`)
- **Bounding box / transform handles для polygon presets на mobile** (`hasBoundingBox()` + hit-test in `App.tsx`)
- **No "Generate" header in phone extras** -- пустой слот TTD без заголовка, пункт Mermaid остаётся (#5069, `MobileToolbar.tsx`)

### Freedraw / Drawing

- **Stroke width slider** -- discrete с squiggle preview (`StrokeWidthRange.tsx`)
- **Highlighter tool** -- freedraw preset с popup toggle (pencil/marker), yellow default, три toolSettings sets (`App.tsx`, `Actions.tsx`); режим маркера — переменная модуля вне `appState`, а `LayerUI` обёрнут в `React.memo`, поэтому режим идёт пропом `isHighlighterMode` (`App` → `LayerUI` → `ShapesSwitcher` и `MobileMenu` → `MobileToolbar` → `MobileSettingsRow`) и `setHighlighterMode` перерисовывает UI; засеянный хостом маркер, в том числе `setToolSettings` после монтирования без смены инструмента, не сбрасывается триггером пикера на десктопе и телефоне
- **Two pen ink algorithms** (с 0.30.11, #5706) -- проп `penInk?: "legacy" | "v2"`, по умолчанию `legacy`. Выбор — настройка модуля `setFreedrawPenInk` в `packages/element/src/shape.ts`, не поле App: `ShapeCache` и экспорт (`exportToSvg`, `exportToCanvas`) работают без экземпляра App, поэтому режим общий для всех редакторов страницы. App ставит его из пропа при монтировании и при смене пропа (флаг хоста приходит позже), сбрасывает `ShapeCache` и перерисовывает сцену; холст элемента помнит свои чернила (`ExcalidrawElementWithCanvas.freedrawInk`) и пересоздаётся при смене. Записанные точки, нажимы и `simulatePressure` в обоих режимах одинаковые. Только сплошной штрих: пунктир и точки рисуются по записанным точкам одинаково в обоих режимах
  - `legacy` = чернила 0.30.9 без изменений (`getFreedrawOutlinePointsLegacy`: LaserPointer со `streamline` 0.45, сырой хвост, зеркало нажима); байтовая сверка с 0.30.9 в `packages/element/tests/freedrawLegacyInk.test.ts` (фикстура `fixtures/freedrawInk-0.30.9.json`). Его не править: это откат для хоста
  - `v2` (`packages/element/src/freedrawInk.ts`) = средняя линия 0.30.10 (`getFreedrawCenterline`: прореживание точек ближе шага, центростремительный Catmull-Rom, симметричное сглаживание колоколом вдоль дуги без отставания, концы на месте, острые углы от 60° не сглаживаются, линия не выходит за рамку точек больше запаса радиуса), но точки выхода стоят через `k·outStep` от начала участка: дописанные точки не сдвигают уже построенные. Контур строится своим кодом без тригонометрии на точку (`writeFreedrawOutlinePath` пишет Path2D напрямую, `getFreedrawOutlineSvgPath` — строку SVG без регулярных выражений); кэш `getFreedrawInk` по идентичности массивов `points`/`pressures`, `ShapeCache.delete` сбрасывает и его. Третья координата средней линии — множитель ширины, не нажим
  - **Починка повторённых блоков в v2** (`getFreedrawRepairedIndices`) -- только при отрисовке, данные не меняются: прыжок назад в точку, точно равную одной из последних 256, после которого блок от неё до точки перед прыжком повторён по порядку (не больше 8 посторонних точек среди повторённых), пропускается при построении контура. Пересечение петлёй старой линии в пикселе блок по порядку не повторяет и починкой не считается (тест на 288 чистых штрихах)
  - **Штрих в процессе рисования в v2** (`freedrawLive.ts`, `FreedrawLiveInk`) -- застывшая часть (дальше ~40 px от конца) режется на куски по 64 точки выхода с перекрытием 1 и заливается один раз в отдельный слой; кадр = слой + пересчитанный хвост, поэтому цена кадра не растёт с длиной штриха. Слой пересобирается при смене масштаба, сдвига, размера холста или цвета; при замене точек (выпрямление удержанием, смена толщины) поток начинается заново; на отпускании — один полный проход. Прозрачность — `destination-in` по слою. `renderNewElementScene` рисует так только сплошной freedraw в `v2`; `legacy` и пунктир идут через `renderElement`, как раньше. Штрих внутри фрейма (`frameId`) рисует статическая сцена (`Renderer.getRenderableElements` не отдаёт его холсту нового элемента), поэтому там каждый кадр — полный проход (в `v2` — дешёвый полный проход, но не инкрементальный)
- **Dashed and dotted pen** -- у freedraw есть стиль линии (`hasStrokeStyle`). Сплошной штрих — залитый контур LaserPointer; пунктир и точки рисуются по средней линии ровной шириной (ширина чернил при среднем нажиме), шаблон `[3w, 3w]` и `[0.01w, 2.5w]` с круглыми концами, на холсте и в SVG; касание (все точки ближе 0.5 к первой, щелчок сдвигает отпускание на 0.0001) — точка, замкнутый штрих — контур; «Небрежность» у пера не показывается (`hasSloppiness`) (`shape.ts` → `isDashedFreedraw`, `getFreeDrawCenterlineSvgPath`; `renderElement.ts`, `staticSvgScene.ts`; `tests/freedrawDashed.test.ts`). Стиль хранится в наборе инструмента (`ToolStrokeSettings.strokeStyle`): пунктир пера не переходит на фигуры и маркер, `setToolSettings` без поля стиль не меняет, мусорное значение отбрасывается
- **Pen, highlighter and eraser stay after a stroke** -- фигуры и текст возвращаются к выделению, как у upstream без замка (#2321, `tests/toolAfterStroke.test.tsx`)
- **Stroke end at the pointerup point** -- в `v2` средняя линия начинается и кончается в записанных концах штриха: окно сглаживания сужается к концам, поэтому без отставания и без прямого «хвоста-касательной» (#3043, #5706, `freedrawInk.ts` → `getFreedrawCenterline`). Нажим 0 у pointerup (и у pointerdown) пера заменяется ближайшим настоящим. В `legacy` — как в 0.30.9: последняя различная точка идёт в LaserPointer без сглаживания позиции
- **Pen width from pressure** -- в `v2` `getFreedrawPenWidth`: 0.3 при нажиме 0, полная ширина от 0.6, между ними easeOutSine. Safari отдаёт силу Apple Pencil, делённую на максимум (~4.17): рука пишет в 0.05–0.3. Мышь (`simulatePressure`) и превью соавтора без нажимов — прежняя ровная ширина `MEDIUM_PRESSURE_WIDTH`; палец без силы (iOS: все нажимы 0) — прежняя `max(0.4, 1.1/size)` (#5706, `tests/freedrawPenSmoothing.test.ts`). В `legacy` — кривая 0.30.9 (easeOutSine с thinning 0.6, пол 1.1 px)
- **Re-delivered coalesced samples** (только `v2`, `freedrawSampleFilter.ts`) -- Safari на iPadOS отдаёт в `getCoalescedEvents()` сэмплы прошлого pointermove повторно и с задержанным сэмплом (WebKit #316105). Фильтр живёт одно касание (засеян сэмплом pointerdown): при своём времени у каждого сэмпла отбрасывается сэмпл старше новейшего принятого и сэмпл того же времени, точно повторяющий принятый (x, y, нажим) — грубые часы дают разным сэмплам одно время; без времени (или одно время на весь список) отбрасывается только повторно доставленный отрезок: список начинается с точных повторов (x, y, нажим) среди последних 256 принятых, между повторами до 2 новых (задержанных), и отрезок доходит до новейшего принятого сэмпла (это прошлый pointermove заново). Остальные повторы остаются: без времени так же выглядит перо или мышь (нажим 0.5 всё время), идущие назад по своим пикселям. В `v2` при пустом буфере и pointermove без новых сэмплов точка не добавляется; `legacy` принимает сэмплы как 0.30.9 (`tests/freedrawInputSamples.test.tsx`)
- **Hold-to-straighten** -- 500ms still timer → line straighten / curve smooth (`straighten.ts`); отпускание во время анимации (250 мс) фиксирует целевую форму без точки отпускания, как после конца анимации; после анимации движение с удержанием вращает и масштабирует штрих, отпускание его фиксирует (#5176, `App.tsx` → `finishStraightenAnimation`, `tests/straightenRelease.test.tsx`)

### Shapes / Presets

- **Wireframe (3D) UX** -- click-through vertex drag, `move` cursor on vertex, 10px edge grab, block dbl-click group entry, vertex priority over resize handles (`App.tsx`)
- **Draggable cone apex** -- shared vertex ID `"APEX"` (`solidFactory.ts`)
- **Triangular prism edges** -- right lateral + top-left solid, not dashed (`solidFactory.ts`)
- **Line close snap** -- конец открытой линии от `LINE_CLOSE_MIN_POINTS` (4) точек ближе `LINE_CLOSE_SNAP_THRESHOLD` (20 экранных px) к другому концу прилипает к нему и при рисовании, и при перетаскивании первой или последней точки; отпускание замыкает линию в многоугольник. Линия из трёх точек (угол V) не прилипает: замыкание схлопнуло бы её в [A, B, A], а не в многоугольник. Пока отпускание замкнёт линию, на другом конце кольцо-индикатор; у замкнутой линии в редакторе кольцо стоит на стыке (первой точке) всегда, и при перетаскивании средней вершины тоже. Стрелки не замыкаются (#5176, `packages/element/src/linearElementEditor.ts`, `renderer/interactiveScene.ts` → `getLineCloseIndicatorPoint`, `getClosedLineSeamPoint`)

### Hotkeys / Input

- **Russian ЙЦУКЕН** -- `getLatinKey()` + Proxy in `App.tsx` (см. `packages/common/AGENTS.md`)
- **Two-finger double-tap undo** -- `touch.identifier` tracking (`App.tsx`)
- **Arrow-key move history** -- сдвиг стрелками захватывается в историю на keyup: одно нажатие или зажатая клавиша = одна запись undo; если keyup потерян (Alt+Tab при зажатой стрелке), захват делается на blur окна (#5050, `App.tsx` → `pendingArrowKeyMoveCapture`, `flushArrowKeyMoveCapture`)
- **Bare +/- zoom** -- «=»/«-» и NumpadAdd/NumpadSubtract без модификаторов зумят холст; в полях ввода не срабатывают, в редакторе текста зум только с Ctrl/Cmd (#2667, `actionCanvas.tsx`, `textWysiwyg.tsx`)
- **No sidebar, no Ctrl+F / Add to library** -- при `DEFAULT_SIDEBAR_AVAILABLE = false` (`packages/common/src/constants.ts`) Ctrl+F остаётся поиском браузера, «Добавить в библиотеку», строка поиска в справке и пункты «Библиотека» и «Найти на холсте» в палитре команд скрыты; включить вместе с #2708 (#5069, `CommandPalette.tsx`, `tests/commandPaletteNoSidebar.test.tsx`)

### API surface

- **ExcalidrawImperativeAPI undo/redo** -- `history.undo()`/`redo()` (`App.tsx`, `types.ts`)
- **Tool settings API** -- `getToolSettings()`, `setToolSettings(partial)`, `onToolSettingsChange(cb)`; снимок `ToolSettingsSnapshot`: наборы `pencil`/`highlighter`/`shape` (`strokeColor`, `strokeWidth`, `opacity`), `highlighterMode`, `pressureSensitivity`, `penModePreference` (`App.tsx`, `types.ts`, `tests/toolSettingsApi.test.tsx`):
  - засев: `setToolSettings` в `onExcalidrawAPI` успевает до restore (`initializeScene` ждёт `initialData`), и `initializeScene` берёт `currentItem*` из набора восстановленного инструмента; без засева поведение прежнее (ширина 2, `#1e1e1e` до первой смены инструмента). После инициализации набор текущего инструмента применяется сразу; после засева любая смена инструмента в обход `setActiveTool` и смена режима маркера грузят набор нового инструмента (см. Gotchas). Очистка холста (`actionClearCanvas`) сохраняет `currentItemStrokeColor`/`StrokeWidth`/`Opacity`, поэтому набор не сбрасывается и хост не уведомляется. Числа чистятся: ширина > 0, прозрачность 0..100, цвет непустой;
  - `onToolSettingsChange` зовётся после `syncActiveSettings` в `componentDidUpdate` (в `onChange` наборы отстают на одно изменение), при смене режима маркера, нажима (`pressureSensitivityEnabled`, его отбрасывает `restoreAppState`) и предпочтения режима пера; одинаковый снимок дважды не уходит, сам `setToolSettings` колбэк не зовёт; исключение колбэка ловится (`console.error`) и не мешает остальным подписчикам и смене инструмента;
  - `penModePreference` пишет только кнопка режима пера (`togglePenMode(null)`), программный `togglePenMode(true|false)` — нет. Первое касание пером (холст и тулбар) идёт через `detectPen()`: при `false` перо определяется (`penDetected`), режим не включается; `null` — прежнее автовключение. `setToolSettings` с `penModePreference: false` гасит режим, с `true` включает его, если перо уже определено (`penDetected`); вызов без этого поля режим пера не трогает;
  - наборы и режим маркера — переменные модуля (общие для экземпляров и переживают размонтирование): это настройки пользователя. Ключ активного набора (`activeSettingsKey`), признак засева, предпочтение режима пера и последний отправленный снимок — поля экземпляра.
- **Image URL drop** -- `text/uri-list` → fetch → `insertImages()` (`App.tsx`)

### Custom UI elements

- **Minimap** -- toggleable, рендерит actual element shapes, click/drag navigation (`Minimap.tsx`)
- **Selection/Lasso ToolPopover** -- dedup с `renderedSelectionPopover` ref (`Actions.tsx`); вариант, совпавший с триггером, получает test id `<trigger>-option` (#3081)
- **Tool tooltip without null** -- подсказка и aria-keyshortcuts инструмента собираются из существующих клавиш (#3079, `shapes.tsx` → `getToolShortcutKeys`)

### Safety patches

- **Render crash protection** -- try-catch в `_renderInteractiveScene` (`interactiveScene.ts`)
- **Linear editor safety** -- "Edit line" requires `selectedLinearElement` (`actionLinearEditor.tsx`)
- **TS 5.7 ArrayBuffer fixes** -- `as ArrayBuffer` / `as BufferSource` assertions across multiple files

### i18n

- **i18n Russian complete** -- все ключи + 13 quality fixes (`locales/ru-RU.json`)
- **Embed placeholder label translated** -- «Empty Web-Embed»/«IFrame element» через `element.emptyEmbeddablePlaceholder`/`element.iframePlaceholder` (#4886, `embeddable.ts`, `staticScene.ts`, `staticSvgScene.ts`)
- **Embed refusal toast** -- `toast.unableToEmbed` не отправляет на GitHub за белым списком: какие ссылки встраиваются, решает хост (#5070, `locales/en.json`, `locales/ru-RU.json`, `tests/embedToastCopy.test.ts`)
- **"Code" font = Cascadia** -- Comic Shanns без кириллицы помечен deprecated и остаётся для старых надписей; в быстрых шрифтах «Код» = Cascadia (#5069, `FontPicker.tsx`, `packages/common/src/font-metadata.ts`)

## Gotchas

- **TS 5.7 ArrayBuffer breaking** -- `Uint8Array.buffer` returns `ArrayBufferLike`, не `ArrayBuffer`. Use `as ArrayBuffer` / `as BufferSource` / `as BlobPart`.
- **max-warnings=0** -- ESLint конфигурирован fail-on-warning. Unused imports чистить.
- **`gridModeEnabled` только показывает сетку** -- у upstream он же включает привязку к сетке, у форка привязка — отдельный `gridSnapEnabled` («Привязка к сетке»). Код, которому нужна привязка, читает `app.getEffectiveGridSize()` или, где есть только `appState` (`packages/element`, рендер), `isGridSnappingEnabled(appState)` = `gridModeEnabled && gridSnapEnabled` (`packages/element/src/utils.ts`). Так работают «Привязка к середине» стрелок, их индикаторы и округление точки крепления к сетке (`binding.ts`, `linearElementEditor.ts`, `interactiveScene.ts`), а также Ctrl при перетаскивании (`snapping.ts` → `isSnappingEnabled`: включает привязку к объектам, если не занят отключением привязки к сетке) и подсказка «Удерживайте Ctrl, чтобы отключить привязку» (`HintViewer.tsx`); при показанной сетке без привязки всё ведёт себя как без сетки (#5176). Хост держит `appState.gridModeEnabled` равным показу сетки доски.
- **React Strict Mode double-render** -- foreach/map crashes в scene renderers. Try-catch wrapper защищает.
- **LaserPointer size = radius** -- НЕ diameter (как в perfect-freehand). При `sizeMapping`: `size * sizeMapping() >= 1.1` для start cap.
- **Touch identifier tracking** -- ВСЕГДА `touch.identifier` для match fingers между touchstart/touchend. Index matching ломается при separate lifts.
- **Polygon preset HACK guards** -- 2 guards в `App.tsx` отключают transform handles для linear elements на mobile. Polygon (`element.polygon === true`) должны быть исключены.
- **Freedraw point count sensitivity** -- в `legacy` (как в 0.30.9) LaserPointer со своим streamline рисует при другом числе точек штрих короче и тоньше (RDP 200→5 или straight 200→2 = visible shrinking). В `v2` сглаживание без отставания и число записанных точек на длину не влияет, но записанные точки по-прежнему не прореживать: их читают ластик-замарывание хоста, выпрямление и соавторы.
- **`legacy` pen ink is a frozen copy** -- `getFreedrawOutlinePointsLegacy` и кривая ширины 0.30.9 сверяются с фикстурой побайтно (`freedrawLegacyInk.test.ts`). Любая правка чернил идёт в `v2` (`freedrawInk.ts`); фикстуру перегенерировать нельзя: она снята со сборки 0.30.9.
- **Three toolSettings sets** (pencil/highlighter/shape) -- `activeSettingsKey` (поле экземпляра App: при двух редакторах на странице коммит одного не переставляет ключ другого) tracks active, switched в `setActiveTool`; набор инструмента выбирает `settingsKeyForTool` (рука, ластик, лазер — `null`, набор не трогают; выбор и лассо — набор фигур, поэтому правка цвета, толщины или прозрачности выделенного элемента меняет набор фигур и уходит хосту). `currentItem*` в состоянии и набор `activeSettingsKey` держатся равными: `syncActiveSettings` пишет состояние обратно в набор на каждом изменении. `componentDidUpdate` на каждом коммите сверяет ключ закоммиченного инструмента и режима маркера с `activeSettingsKey`: при расхождении — любая смена инструмента в обход `setActiveTool` (прямой `setState`/`updateActiveTool` в действиях и обработчиках) или режим маркера от хоста — `currentItem*` ещё держат чужой набор, поэтому набор нового инструмента грузится (`applyToolSettings`), а в этом коммите ничего не пишется (изменение нажима в этом же коммите уходит хосту сразу, наборы в снимке нетронутые). Загрузка — только после засева хостом (`toolSettingsSeeded`) и после инициализации; без засева при записи ключ лишь выводится заново. Функция `setState` из `setToolSettings` исполняется в очереди пачки и видит инструмент до смены, поэтому ключ она не меняет. Действия, сбрасывающие appState к умолчаниям, обязаны сохранять `currentItem*` наборов (как `actionClearCanvas`), иначе умолчания запишутся в активный набор и уйдут хосту.

## When working here

- Изменение поведения -- CHANGELOG; bump версии при выпуске. Docs-only bump не требует.
- Для кода перед commit: `yarn fix` (0 warnings) + `yarn test:typecheck`
- Если меняешь `App.tsx` -- осторожно с touch/pointer logic, легко сломать существующие patches
