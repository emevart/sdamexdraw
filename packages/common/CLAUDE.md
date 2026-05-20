# packages/common -- Fork conventions

> Loaded automatically when Claude works in `packages/common/`.

Shared constants/utils, bundled в excalidraw. Самые важные fork patches здесь.

## Key files

| Файл | Что |
| --- | --- |
| `src/keys.ts` | **`getLatinKey()`** -- ЙЦУКЕН → Latin mapping для hotkeys |
| `src/editorInterface.ts` | **`deriveStylesPanelMode()`** -- formFactor → panel mode |
| `src/constants.ts` | Globals, `HOLD_TO_STRAIGHTEN_*` thresholds, etc. |

## ЙЦУКЕН hotkey patch

В `App.tsx` и `shapes.tsx` -- Proxy wraps `e.key` через `getLatinKey()`: русская раскладка `й` → `q`, `ц` → `w` и т.д.

**Не ломать:** любые keyboard handlers в форке должны идти через `getLatinKey()`, иначе hotkeys не работают на русской раскладке.

## StylesPanelMode

`"compact" | "full" | "mobile"` -- контролирует properties panel rendering.

- **`compact`** -- non-phone devices (наш default для всех desktop/tablet)
- **`full`** -- never used в форке (forced off через `deriveStylesPanelMode`)
- **`mobile`** -- только phone formFactor

`EditorInterface.formFactor`: `"phone" | "tablet" | "desktop"` -- определяется по editor dimensions.

## Constants worth knowing

- `HOLD_TO_STRAIGHTEN_DURATION` -- 500ms still timer перед straighten
- `HOLD_TO_STRAIGHTEN_*` thresholds -- low deviation → line, otherwise → curve smooth
- Mobile breakpoints -- задают touch-targets sizing

## Gotchas

- **`constants.ts` -- bundled в `@emevart/excalidraw`**, поэтому любое изменение требует bump version.
- **`keys.ts` patch -- не дублировать упоминания keys в коде**, всегда через `getLatinKey()`.
