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
- **Side resize handles on non-mobile devices** -- n/s/e/w ручки рисуются при `userAgent.isMobileDevice === false`; iPad -- апстримная полоса у стороны, телефон -- ручки (#3042, `packages/element/src/transformHandles.ts` → `getOmitSidesForEditorInterface`)

### Mobile

- **All 14 shape presets в SHAPE_TOOLS** (`MobileToolBar.tsx`)
- **Extra tools dropdown opens upward** (`side="top"`, `DropdownMenuContent.tsx`)
- **Bounding box / transform handles для polygon presets на mobile** (`hasBoundingBox()` + hit-test in `App.tsx`)
- **No "Generate" header in phone extras** -- пустой слот TTD без заголовка, пункт Mermaid остаётся (#5069, `MobileToolbar.tsx`)

### Freedraw / Drawing

- **Stroke width slider** -- discrete с squiggle preview (`StrokeWidthRange.tsx`)
- **Highlighter tool** -- freedraw preset с popup toggle (pencil/marker), yellow default, три toolSettings sets (`App.tsx`, `Actions.tsx`); режим маркера — переменная модуля вне `appState`, а `LayerUI` обёрнут в `React.memo`, поэтому режим идёт пропом `isHighlighterMode` (`App` → `LayerUI` → `ShapesSwitcher` и `MobileMenu` → `MobileToolbar` → `MobileSettingsRow`) и `setHighlighterMode` перерисовывает UI; засеянный хостом маркер, в том числе `setToolSettings` после монтирования без смены инструмента, не сбрасывается триггером пикера на десктопе и телефоне
- **LaserPointer freedraw rendering** -- `@excalidraw/laser-pointer`, 75° corner detection (`shape.ts`)
- **Stroke end unsmoothed** -- последняя отличная точка подаётся в LaserPointer с `streamline = 0`, чернила доходят до точки pointerup; сырой остаётся только позиция, давление хвоста сглаживается, как у остальных точек (у пера pointerup приходит с pressure 0); число точек не меняется (#3043, `shape.ts` → `getFreedrawOutlinePoints`)
- **Hold-to-straighten** -- 500ms still timer → line straighten / curve smooth (`straighten.ts`)

### Shapes / Presets

- **Wireframe (3D) UX** -- click-through vertex drag, `move` cursor on vertex, 10px edge grab, block dbl-click group entry, vertex priority over resize handles (`App.tsx`)
- **Draggable cone apex** -- shared vertex ID `"APEX"` (`solidFactory.ts`)
- **Triangular prism edges** -- right lateral + top-left solid, not dashed (`solidFactory.ts`)

### Hotkeys / Input

- **Russian ЙЦУКЕН** -- `getLatinKey()` + Proxy in `App.tsx` (см. `packages/common/AGENTS.md`)
- **Two-finger double-tap undo** -- `touch.identifier` tracking (`App.tsx`)
- **Arrow-key move history** -- сдвиг стрелками захватывается в историю на keyup: одно нажатие или зажатая клавиша = одна запись undo; если keyup потерян (Alt+Tab при зажатой стрелке), захват делается на blur окна (#5050, `App.tsx` → `pendingArrowKeyMoveCapture`, `flushArrowKeyMoveCapture`)
- **Bare +/- zoom** -- «=»/«-» и NumpadAdd/NumpadSubtract без модификаторов зумят холст; в полях ввода не срабатывают, в редакторе текста зум только с Ctrl/Cmd (#2667, `actionCanvas.tsx`, `textWysiwyg.tsx`)
- **No sidebar, no Ctrl+F / Add to library** -- при `DEFAULT_SIDEBAR_AVAILABLE = false` (`packages/common/src/constants.ts`) Ctrl+F остаётся поиском браузера, «Добавить в библиотеку» и строка поиска в справке скрыты; включить вместе с #2708 (#5069)

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
- **"Code" font = Cascadia** -- Comic Shanns без кириллицы помечен deprecated и остаётся для старых надписей; в быстрых шрифтах «Код» = Cascadia (#5069, `FontPicker.tsx`, `packages/common/src/font-metadata.ts`)

## Gotchas

- **TS 5.7 ArrayBuffer breaking** -- `Uint8Array.buffer` returns `ArrayBufferLike`, не `ArrayBuffer`. Use `as ArrayBuffer` / `as BufferSource` / `as BlobPart`.
- **max-warnings=0** -- ESLint конфигурирован fail-on-warning. Unused imports чистить.
- **React Strict Mode double-render** -- foreach/map crashes в scene renderers. Try-catch wrapper защищает.
- **LaserPointer size = radius** -- НЕ diameter (как в perfect-freehand). При `sizeMapping`: `size * sizeMapping() >= 1.1` для start cap.
- **Touch identifier tracking** -- ВСЕГДА `touch.identifier` для match fingers между touchstart/touchend. Index matching ломается при separate lifts.
- **Polygon preset HACK guards** -- 2 guards в `App.tsx` отключают transform handles для linear elements на mobile. Polygon (`element.polygon === true`) должны быть исключены.
- **Freedraw point count sensitivity** -- LaserPointer рендерит visually different (shorter/thinner) strokes при point count change. НЕ reduce count (RDP 200→5 или straight 200→2 = visible shrinking). Менять только positions.
- **Three toolSettings sets** (pencil/highlighter/shape) -- `activeSettingsKey` (поле экземпляра App: при двух редакторах на странице коммит одного не переставляет ключ другого) tracks active, switched в `setActiveTool`; набор инструмента выбирает `settingsKeyForTool` (рука, ластик, лазер — `null`, набор не трогают; выбор и лассо — набор фигур, поэтому правка цвета, толщины или прозрачности выделенного элемента меняет набор фигур и уходит хосту). `currentItem*` в состоянии и набор `activeSettingsKey` держатся равными: `syncActiveSettings` пишет состояние обратно в набор на каждом изменении. `componentDidUpdate` на каждом коммите сверяет ключ закоммиченного инструмента и режима маркера с `activeSettingsKey`: при расхождении — любая смена инструмента в обход `setActiveTool` (прямой `setState`/`updateActiveTool` в действиях и обработчиках) или режим маркера от хоста — `currentItem*` ещё держат чужой набор, поэтому набор нового инструмента грузится (`applyToolSettings`), а в этом коммите ничего не пишется (изменение нажима в этом же коммите уходит хосту сразу, наборы в снимке нетронутые). Загрузка — только после засева хостом (`toolSettingsSeeded`) и после инициализации; без засева при записи ключ лишь выводится заново. Функция `setState` из `setToolSettings` исполняется в очереди пачки и видит инструмент до смены, поэтому ключ она не меняет. Действия, сбрасывающие appState к умолчаниям, обязаны сохранять `currentItem*` наборов (как `actionClearCanvas`), иначе умолчания запишутся в активный набор и уйдут хосту.

## When working here

- Изменение поведения -- CHANGELOG; bump версии при выпуске. Docs-only bump не требует.
- Для кода перед commit: `yarn fix` (0 warnings) + `yarn test:typecheck`
- Если меняешь `App.tsx` -- осторожно с touch/pointer logic, легко сломать существующие patches
