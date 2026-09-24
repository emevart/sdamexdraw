import React from "react";

import { actionChangeStrokeColor, actionDeselect } from "../actions";
import { actionToggleEraserTool } from "../actions/actionCanvas";
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

  // Хост зовёт setToolSettings после загрузки профиля: при выборе набор фигур
  // не меняется, и тулбар узнаёт о режиме маркера только из пропа LayerUI.
  // Иначе триггер вернёт карандаш, а хост запишет это в аккаунт.
  it("(2) a highlighter mode set by the host after mount reaches the picker", async () => {
    await renderSeeded(SEED);
    act(() => {
      h.app.api.setToolSettings({ highlighterMode: true });
    });
    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);

    const trigger = document.querySelector<HTMLElement>(
      '[data-testid="toolbar-freedraw"]',
    );
    expect(trigger).not.toBeNull();
    fireEvent.pointerDown(trigger!);

    expect(h.state.activeTool.type).toBe("freedraw");
    expect(h.app.getIsHighlighterMode()).toBe(true);
    expect(currentItem()).toEqual(SEED.highlighter);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("(2) a highlighter mode set by the host after mount reaches the phone toolbar", async () => {
    await renderSeeded(SEED, { UIOptions: { getFormFactor: () => "phone" } });
    // как в mobileExtrasMenu.test.tsx: resize перечитывает форм-фактор
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(h.app.editorInterface.formFactor).toBe("phone");

    act(() => {
      h.app.api.setToolSettings({ highlighterMode: true });
    });
    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);

    const tool = document.querySelector<HTMLInputElement>(
      '[data-testid="toolbar-freedraw"]',
    );
    expect(tool).not.toBeNull();
    fireEvent.click(tool!);

    expect(h.state.activeTool.type).toBe("freedraw");
    expect(h.app.getIsHighlighterMode()).toBe(true);
    expect(currentItem()).toEqual(SEED.highlighter);
    expect(onChange).not.toHaveBeenCalled();
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
    // в одной пачке функция setToolSettings видит инструмент до смены: набор
    // фигур не должен получить значения карандаша
    expect(currentItem()).toEqual(SEED.pencil);
    expect(h.app.api.getToolSettings().shape).toEqual(SEED.shape);
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

  it("(4) a host highlighter mode flip with the pencil active keeps the pencil set", async () => {
    await renderSeeded(SEED);
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    expect(currentItem()).toEqual(SEED.pencil);
    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);

    // инструмент не меняется, меняется набор: значения маркера не должны
    // уйти в набор карандаша
    act(() => {
      h.app.api.setToolSettings({ highlighterMode: true });
    });
    expect(currentItem()).toEqual(SEED.highlighter);
    expect(h.app.api.getToolSettings()).toEqual({
      ...SEED,
      highlighterMode: true,
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
        currentItemStrokeColor: "#f08c00",
      });
    });
    expect(h.app.api.getToolSettings().highlighter).toEqual({
      ...SEED.highlighter,
      strokeColor: "#f08c00",
    });
    expect(h.app.api.getToolSettings().pencil).toEqual(SEED.pencil);
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

  it("(6) setToolSettings with penModePreference=true turns a detected pen's mode on", async () => {
    await renderSeeded({ ...SEED, penModePreference: false });
    pen.downAt(100, 100);
    pen.upAt(100, 100);
    expect(h.state.penDetected).toBe(true);
    expect(h.state.penMode).toBe(false);

    act(() => {
      h.app.api.setToolSettings({ penModePreference: true });
    });
    expect(h.state.penMode).toBe(true);

    act(() => {
      h.app.api.setToolSettings({ penModePreference: false });
    });
    expect(h.state.penMode).toBe(false);

    // частичный вызов без поля режим пера не трогает
    act(() => {
      h.app.togglePenMode(true);
    });
    act(() => {
      h.app.api.setToolSettings({ pencil: SEED.pencil });
    });
    expect(h.state.penMode).toBe(true);
  });

  it("(6) penModePreference=true before any pen contact waits for the pen", async () => {
    await renderSeeded({ ...SEED, penModePreference: null });
    act(() => {
      h.app.api.setToolSettings({ penModePreference: true });
    });
    expect(h.state.penDetected).toBe(false);
    expect(h.state.penMode).toBe(false);

    pen.downAt(100, 100);
    pen.upAt(100, 100);
    expect(h.state.penMode).toBe(true);
  });

  it("(6) setHighlighterMode alone notifies the host once", async () => {
    await renderSeeded(SEED);
    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);

    // без setActiveTool: уведомление обязано прийти из самого setHighlighterMode
    act(() => {
      h.app.setHighlighterMode(true);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({
      ...SEED,
      highlighterMode: true,
    });
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

  // Колбэк хоста пишет в хранилище (на iOS localStorage бывает переполнен):
  // его исключение не должно прерывать смену инструмента и ронять редактор
  it("(9) a throwing host callback neither blocks the editor nor other subscribers", async () => {
    await renderSeeded(SEED);
    const error = new Error("QuotaExceededError");
    const throwing = vi.fn(() => {
      throw error;
    });
    const next = vi.fn();
    h.app.api.onToolSettingsChange(throwing);
    h.app.api.onToolSettingsChange(next);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      // режим маркера уведомляет хоста до смены инструмента
      act(() => {
        h.app.setHighlighterMode(true);
        h.app.setActiveTool({ type: "freedraw" });
      });
      expect(h.state.activeTool.type).toBe("freedraw");
      expect(currentItem()).toEqual(SEED.highlighter);

      // уведомление из componentDidUpdate
      act(() => {
        h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
          currentItemStrokeColor: "#f08c00",
        });
      });
      expect(h.state.currentItemStrokeColor).toBe("#f08c00");
      expect(h.app.api.getToolSettings().highlighter.strokeColor).toBe(
        "#f08c00",
      );

      expect(throwing).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenCalledWith(error);
    } finally {
      consoleError.mockRestore();
    }
  });

  // Переходы в обход applyToolSettings (Esc, снятие замка, возврат из ластика)
  // меняют инструмент, а currentItem* остаются от прежнего набора: редактор
  // обязан загрузить набор нового инструмента, а не записать в него чужие
  // значения (они ушли бы хосту и в аккаунт).
  const recolorSelected = (color: string) => {
    const rect = API.createElement({ type: "rectangle" });
    API.setElements([rect]);
    API.setSelectedElements([rect]);
    act(() => {
      h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
        currentItemStrokeColor: color,
      });
    });
    expect(API.getElement(rect).strokeColor).toBe(color);
  };

  it("(10) Esc from the marker loads the shape set, a selected shape recolor keeps its width and opacity", async () => {
    await renderSeeded({ ...SEED, highlighterMode: true });
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    expect(currentItem()).toEqual(SEED.highlighter);

    act(() => {
      h.app.actionManager.executeAction(actionDeselect, "keyboard");
    });
    expect(h.state.activeTool.type).toBe("selection");
    expect(currentItem()).toEqual(SEED.shape);

    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);
    recolorSelected("#e8590c");

    // при выборе действует набор фигур: цвет выделенной фигуры становится
    // цветом новых фигур, толщина и прозрачность остаются из набора
    const expected: ToolSettingsSnapshot = {
      ...SEED,
      highlighterMode: true,
      shape: { ...SEED.shape, strokeColor: "#e8590c" },
    };
    expect(h.app.api.getToolSettings()).toEqual(expected);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("(10) unlocking the pencil loads the set of the tool it returns to", async () => {
    await renderSeeded(SEED);
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    act(() => {
      h.app.toggleLock();
    });
    expect(h.state.activeTool.locked).toBe(true);
    expect(currentItem()).toEqual(SEED.pencil);

    act(() => {
      h.app.toggleLock();
    });
    expect(h.state.activeTool.type).toBe("selection");
    expect(currentItem()).toEqual(SEED.shape);

    recolorSelected("#e8590c");
    expect(h.app.api.getToolSettings()).toEqual({
      ...SEED,
      shape: { ...SEED.shape, strokeColor: "#e8590c" },
    });
  });

  it("(10) a host marker mode change during erasing does not mix the pencil and marker sets", async () => {
    await renderSeeded({ ...SEED, highlighterMode: true });
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    act(() => {
      h.app.actionManager.executeAction(actionToggleEraserTool);
    });
    expect(h.state.activeTool.type).toBe("eraser");

    act(() => {
      h.app.api.setToolSettings({ highlighterMode: false });
    });
    const onChange = vi.fn();
    h.app.api.onToolSettingsChange(onChange);

    act(() => {
      h.app.actionManager.executeAction(actionToggleEraserTool);
    });
    expect(h.state.activeTool.type).toBe("freedraw");
    expect(currentItem()).toEqual(SEED.pencil);
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
        currentItemStrokeColor: "#e8590c",
      });
    });
    expect(h.app.api.getToolSettings()).toEqual({
      ...SEED,
      pencil: { ...SEED.pencil, strokeColor: "#e8590c" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
