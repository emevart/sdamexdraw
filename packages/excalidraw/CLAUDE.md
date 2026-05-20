# packages/excalidraw -- Fork conventions

> Loaded automatically when Claude works in `packages/excalidraw/`.

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
| `types.ts` | ExcalidrawImperativeAPI surface (undo/redo) |
| `appState.ts` | gridSnap, three toolSettings sets |
| `locales/ru-RU.json` | Полный русский (vetted) |
| `css/styles.scss` | Zoom controls alignment, editor padding |

## Fork customizations (grouped)

### UI / Layout

- **Compact styles panel forced** -- non-phone devices (`packages/common/src/editorInterface.ts` → `deriveStylesPanelMode`)
- **Preferences в hamburger menu** -- grid toggle, grid snap, others (`LayerUI.tsx`)
- **Custom tooltips** -- replaced native `title=` с `<Tooltip>` (400ms, 11px, Apple Pencil hover support)
- **Canvas background TopPicks visible в compact** (`ColorPicker.tsx`)
- **Confirm dialog never fullscreen в compact/phone** (`ConfirmDialog.scss`)
- **Zoom controls alignment** -- `--editor-container-padding` (`css/styles.scss`)

### Mobile

- **All 14 shape presets в SHAPE_TOOLS** (`MobileToolBar.tsx`)
- **Extra tools dropdown opens upward** (`side="top"`, `DropdownMenuContent.tsx`)
- **Bounding box / transform handles для polygon presets на mobile** (`hasBoundingBox()` + hit-test in `App.tsx`)

### Freedraw / Drawing

- **Stroke width slider** -- discrete с squiggle preview (`StrokeWidthRange.tsx`)
- **Highlighter tool** -- freedraw preset с popup toggle (pencil/marker), yellow default, три toolSettings sets (`App.tsx`, `Actions.tsx`)
- **LaserPointer freedraw rendering** -- `@excalidraw/laser-pointer`, 75° corner detection (`shape.ts`)
- **Hold-to-straighten** -- 500ms still timer → line straighten / curve smooth (`straighten.ts`)

### Shapes / Presets

- **Wireframe (3D) UX** -- click-through vertex drag, `move` cursor on vertex, 10px edge grab, block dbl-click group entry, vertex priority over resize handles (`App.tsx`)
- **Draggable cone apex** -- shared vertex ID `"APEX"` (`solidFactory.ts`)
- **Triangular prism edges** -- right lateral + top-left solid, not dashed (`solidFactory.ts`)

### Hotkeys / Input

- **Russian ЙЦУКЕН** -- `getLatinKey()` + Proxy in `App.tsx` (см. `packages/common/CLAUDE.md`)
- **Two-finger double-tap undo** -- `touch.identifier` tracking (`App.tsx`)

### API surface

- **ExcalidrawImperativeAPI undo/redo** -- `history.undo()`/`redo()` (`App.tsx`, `types.ts`)
- **Image URL drop** -- `text/uri-list` → fetch → `insertImages()` (`App.tsx`)

### Custom UI elements

- **Minimap** -- toggleable, рендерит actual element shapes, click/drag navigation (`Minimap.tsx`)
- **Selection/Lasso ToolPopover** -- dedup с `renderedSelectionPopover` ref (`Actions.tsx`)

### Safety patches

- **Render crash protection** -- try-catch в `_renderInteractiveScene` (`interactiveScene.ts`)
- **Linear editor safety** -- "Edit line" requires `selectedLinearElement` (`actionLinearEditor.tsx`)
- **TS 5.7 ArrayBuffer fixes** -- `as ArrayBuffer` / `as BufferSource` assertions across multiple files

### i18n

- **i18n Russian complete** -- все ключи + 13 quality fixes (`locales/ru-RU.json`)

## Gotchas

- **TS 5.7 ArrayBuffer breaking** -- `Uint8Array.buffer` returns `ArrayBufferLike`, не `ArrayBuffer`. Use `as ArrayBuffer` / `as BufferSource` / `as BlobPart`.
- **max-warnings=0** -- ESLint конфигурирован fail-on-warning. Unused imports чистить.
- **React Strict Mode double-render** -- foreach/map crashes в scene renderers. Try-catch wrapper защищает.
- **LaserPointer size = radius** -- НЕ diameter (как в perfect-freehand). При `sizeMapping`: `size * sizeMapping() >= 1.1` для start cap.
- **Touch identifier tracking** -- ВСЕГДА `touch.identifier` для match fingers между touchstart/touchend. Index matching ломается при separate lifts.
- **Polygon preset HACK guards** -- 2 guards в `App.tsx` отключают transform handles для linear elements на mobile. Polygon (`element.polygon === true`) должны быть исключены.
- **Freedraw point count sensitivity** -- LaserPointer рендерит visually different (shorter/thinner) strokes при point count change. НЕ reduce count (RDP 200→5 или straight 200→2 = visible shrinking). Менять только positions.
- **Three toolSettings sets** (pencil/highlighter/shape) -- `activeSettingsKey` tracks active, switched в `setActiveTool`.

## When working here

- Любой patch -- запись в CHANGELOG.md (root) + bump version
- Перед commit: `yarn fix` (0 warnings) + `yarn test:typecheck`
- Если меняешь `App.tsx` -- осторожно с touch/pointer logic, легко сломать существующие patches
