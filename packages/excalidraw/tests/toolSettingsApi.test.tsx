import React from "react";

import { actionChangeStrokeColor } from "../actions";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import {
  act,
  fireEvent,
  render,
  unmountComponent,
  waitFor,
} from "./test-utils";

import type { ToolSettingsSnapshot } from "../types";

// window test handle, same pattern as regressionTests.test.tsx
const { h } = window;

const pen = new Pointer("pen", 14);

// Наборы модульные и переживают размонтирование, поэтому каждый тест
// засевает все поля, от которых зависит
const SEED: ToolSettingsSnapshot = {
  pencil: { strokeColor: "#1971c2", strokeWidth: 3, opacity: 90 },
  highlighter: { strokeColor: "#40c057", strokeWidth: 16, opacity: 30 },
  shape: { strokeColor: "#e03131", strokeWidth: 2, opacity: 80 },
  highlighterMode: false,
  pressureSensitivity: true,
  penModePreference: null,
};

// Засев так, как его делает хост: синхронно в onExcalidrawAPI, до restore
// (initializeScene доходит до restore только после await initialData)
const renderSeeded = (
  seed: Partial<ToolSettingsSnapshot>,
  props: React.ComponentProps<typeof Excalidraw> = {},
) =>
  render(
    <Excalidraw
      handleKeyboardGlobally={true}
      onExcalidrawAPI={(api) => api?.setToolSettings(seed)}
      {...props}
    />,
  );

const currentItem = () => ({
  strokeColor: h.state.currentItemStrokeColor,
  strokeWidth: h.state.currentItemStrokeWidth,
  opacity: h.state.currentItemOpacity,
});

describe("api tool settings (sdamex)", () => {
  beforeEach(() => {
    unmountComponent();
    Pointer.resetAll();
  });

  it("(1) seeding in onExcalidrawAPI gives the restored pencil its set", async () => {
    await renderSeeded(SEED, {
      initialData: { appState: { activeTool: { type: "freedraw" } } as any },
    });

    expect(h.state.activeTool.type).toBe("freedraw");
    expect(currentItem()).toEqual(SEED.pencil);
  });

  it("(2) highlighter mode seeds the highlighter set and the picker keeps it", async () => {
    await renderSeeded(
      { ...SEED, highlighterMode: true },
      {
        initialData: { appState: { activeTool: { type: "freedraw" } } as any },
      },
    );

    expect(currentItem()).toEqual(SEED.highlighter);
    expect(h.app.getIsHighlighterMode()).toBe(true);

    // триггер пикера вызывает onToolChange(defaultOption): вариант по
    // умолчанию обязан быть маркером, иначе нажатие сбросит режим
    act(() => {
      h.app.setActiveTool({ type: "selection" });
    });
    const trigger = document.querySelector<HTMLElement>(
      '[data-testid="toolbar-freedraw"]',
    );
    expect(trigger).not.toBeNull();
    fireEvent.pointerDown(trigger!);

    expect(h.state.activeTool.type).toBe("freedraw");
    expect(h.app.getIsHighlighterMode()).toBe(true);
    expect(currentItem()).toEqual(SEED.highlighter);
  });

  it("(3) a panel color change updates only the active set and notifies the host", async () => {
    await renderSeeded(SEED);
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    const onChange = vi.fn();
    const unsubscribe = h.app.api.onToolSettingsChange(onChange);

    act(() => {
      h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
        currentItemStrokeColor: "#f08c00",
      });
    });

    const expected: ToolSettingsSnapshot = {
      ...SEED,
      pencil: { ...SEED.pencil, strokeColor: "#f08c00" },
    };
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expect(h.app.api.getToolSettings()).toEqual(expected);

    // переключение инструмента набор не меняет и хоста не зовёт
    act(() => {
      h.app.setActiveTool({ type: "rectangle" });
    });
    expect(currentItem()).toEqual(SEED.shape);
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("(4) setToolSettings after init applies the active set at once, without an echo", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    act(() => {
      h.app.api.setToolSettings(SEED);
      h.app.setActiveTool({ type: "freedraw" });
    });
    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);

    act(() => {
      h.app.api.setToolSettings({
        pencil: { strokeColor: "#9c36b5", strokeWidth: 5, opacity: 70 },
      });
    });
    expect(currentItem()).toEqual({
      strokeColor: "#9c36b5",
      strokeWidth: 5,
      opacity: 70,
    });
    expect(onChange).not.toHaveBeenCalled();

    // мусор из хранилища не ломает набор: ширина > 0, прозрачность 0..100
    act(() => {
      h.app.api.setToolSettings({
        pencil: { strokeColor: "", strokeWidth: 0, opacity: 250 },
      });
    });
    expect(currentItem()).toEqual({
      strokeColor: "#9c36b5",
      strokeWidth: 5,
      opacity: 100,
    });
    act(() => {
      h.app.api.setToolSettings({
        pencil: { strokeColor: "#9c36b5", strokeWidth: NaN, opacity: -5 },
      });
    });
    expect(currentItem()).toEqual({
      strokeColor: "#9c36b5",
      strokeWidth: 5,
      opacity: 0,
    });
  });

  it("(5) without seeding the upstream defaults stay", async () => {
    await render(
      <Excalidraw
        initialData={{ appState: { activeTool: { type: "freedraw" } } as any }}
      />,
    );

    expect(h.state.currentItemStrokeWidth).toBe(2);
    expect(h.state.currentItemStrokeColor).toBe("#1e1e1e");
  });

  it("(6) penModePreference=false: the first pen contact keeps pen mode off", async () => {
    await renderSeeded({ ...SEED, penModePreference: false });

    pen.downAt(100, 100);
    pen.upAt(100, 100);

    expect(h.state.penDetected).toBe(true);
    expect(h.state.penMode).toBe(false);
  });

  it("(6) penModePreference=false: a pen tap on a toolbar tool keeps pen mode off", async () => {
    await renderSeeded({ ...SEED, penModePreference: false });
    const tool = document.querySelector<HTMLInputElement>(
      '[data-testid="toolbar-text"]',
    );
    expect(tool).not.toBeNull();

    // Actions.tsx: перо ловится на pointerdown, режим — в rAF после change
    fireEvent.pointerDown(tool!, { pointerType: "pen" });
    fireEvent.click(tool!);
    await waitFor(() => expect(h.state.penDetected).toBe(true));

    expect(h.state.activeTool.type).toBe("text");
    expect(h.state.penMode).toBe(false);
  });

  it("(6) penModePreference=null: the first pen contact turns pen mode on, as before", async () => {
    await renderSeeded({ ...SEED, penModePreference: null });

    pen.downAt(100, 100);
    pen.upAt(100, 100);

    expect(h.state.penDetected).toBe(true);
    expect(h.state.penMode).toBe(true);
  });

  it("(6) the pen mode button records the preference, togglePenMode(true) does not", async () => {
    await renderSeeded({ ...SEED, penModePreference: null });
    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);

    act(() => {
      h.app.togglePenMode(true);
    });
    expect(h.state.penMode).toBe(true);
    expect(h.app.api.getToolSettings().penModePreference).toBe(null);
    expect(onChange).not.toHaveBeenCalled();

    const button = document.querySelector<HTMLInputElement>(
      ".ToolIcon__penMode input",
    );
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    expect(h.state.penMode).toBe(false);
    expect(h.app.api.getToolSettings().penModePreference).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall![0].penModePreference).toBe(false);
  });

  it("(6) setToolSettings with penModePreference=false turns pen mode off", async () => {
    await renderSeeded({ ...SEED, penModePreference: null });
    act(() => {
      h.app.togglePenMode(true);
    });
    expect(h.state.penMode).toBe(true);

    act(() => {
      h.app.api.setToolSettings({ penModePreference: false });
    });
    expect(h.state.penMode).toBe(false);
  });

  it("(6) highlighter mode changes notify the host", async () => {
    await renderSeeded(SEED);
    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);

    act(() => {
      h.app.setHighlighterMode(true);
      h.app.setActiveTool({ type: "freedraw" });
    });

    expect(currentItem()).toEqual(SEED.highlighter);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall![0].highlighterMode).toBe(true);
  });

  it("(7) pressure sensitivity survives restore and its toggle notifies the host", async () => {
    await renderSeeded({ ...SEED, pressureSensitivity: false });
    expect(h.state.pressureSensitivityEnabled).toBe(false);
    expect(h.app.api.getToolSettings().pressureSensitivity).toBe(false);

    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);
    act(() => {
      // так переключает пункт меню (DefaultItems.tsx)
      API.setAppState({ pressureSensitivityEnabled: true });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall![0].pressureSensitivity).toBe(true);
  });

  it("(8) the emitter is cleared on unmount", async () => {
    await renderSeeded(SEED);
    const app = h.app;
    app.api.onToolSettingsChange(vi.fn());
    expect(app.toolSettingsChangeEmitter.subscribers).toHaveLength(1);

    unmountComponent();

    expect(app.toolSettingsChangeEmitter.subscribers).toHaveLength(0);
  });
});
