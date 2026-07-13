import React from "react";
import { act } from "react-dom/test-utils";

import { MQ_MIN_WIDTH_DESKTOP } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import {
  GlobalTestState,
  fireEvent,
  render,
  unmountComponent,
} from "./test-utils";

const { h } = window;

const pointerEvent = (overrides: object) => ({
  pointerId: 71,
  pointerType: "mouse",
  button: 2,
  buttons: 2,
  clientX: 300,
  clientY: 300,
  ...overrides,
});

/** Full right-button gesture: down -> moves (window-level) -> up -> contextmenu. */
const rightGesture = (moves: [number, number][]) => {
  const canvas = GlobalTestState.interactiveCanvas;
  fireEvent.pointerDown(canvas, pointerEvent({}));
  for (const [x, y] of moves) {
    fireEvent.pointerMove(window, pointerEvent({ clientX: x, clientY: y }));
  }
  const last = moves[moves.length - 1] ?? [300, 300];
  fireEvent.pointerUp(
    window,
    pointerEvent({ clientX: last[0], clientY: last[1] }),
  );
  fireEvent.contextMenu(
    canvas,
    pointerEvent({ clientX: last[0], clientY: last[1] }),
  );
};

beforeEach(async () => {
  unmountComponent();
  localStorage.clear();

  await render(<Excalidraw handleKeyboardGlobally={true} />);
  API.setAppState({ height: 768, width: MQ_MIN_WIDTH_DESKTOP });
});

describe("right mouse button pans the canvas (#881)", () => {
  it("right-drag past the threshold pans and suppresses the context menu", () => {
    const { scrollX, scrollY } = h.state;

    rightGesture([
      [340, 340],
      [380, 380],
    ]);

    expect(h.state.scrollX).not.toBe(scrollX);
    expect(h.state.scrollY).not.toBe(scrollY);
    expect(h.state.contextMenu).toBeNull();
  });

  it("right-click without movement opens the context menu and does not pan", () => {
    const { scrollX, scrollY } = h.state;

    rightGesture([]);

    expect(h.state.scrollX).toBe(scrollX);
    expect(h.state.scrollY).toBe(scrollY);
    expect(h.state.contextMenu).not.toBeNull();
  });

  it("sub-threshold wiggle still opens the context menu (click, not drag)", () => {
    const { scrollX, scrollY } = h.state;

    rightGesture([[304, 303]]);

    expect(h.state.scrollX).toBe(scrollX);
    expect(h.state.scrollY).toBe(scrollY);
    expect(h.state.contextMenu).not.toBeNull();
  });

  it("right-drag does not touch the current selection", () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
    API.setElements([rect]);
    API.setAppState({ selectedElementIds: { [rect.id]: true } });

    rightGesture([
      [340, 340],
      [380, 380],
    ]);

    expect(h.state.selectedElementIds).toEqual({ [rect.id]: true });
  });

  it("pen secondary (barrel) button is reserved for the context menu — no pan", () => {
    const { scrollX, scrollY } = h.state;
    const canvas = GlobalTestState.interactiveCanvas;

    fireEvent.pointerDown(canvas, pointerEvent({ pointerType: "pen" }));
    fireEvent.pointerMove(
      window,
      pointerEvent({ pointerType: "pen", clientX: 380, clientY: 380 }),
    );
    fireEvent.pointerUp(
      window,
      pointerEvent({ pointerType: "pen", clientX: 380, clientY: 380 }),
    );

    expect(h.state.scrollX).toBe(scrollX);
    expect(h.state.scrollY).toBe(scrollY);
  });

  it("left-drag drawing still works after a right-drag pan", () => {
    act(() => {
      h.app.setActiveTool({ type: "rectangle" });
    });
    const canvas = GlobalTestState.interactiveCanvas;
    // Move/up на канвасе (как Pointer-хелпер): в реальном браузере события
    // всплывают с канваса до window/document, window-only диспатч в jsdom
    // не достигает слушателей на document.
    const leftDraw = (x: number, y: number) => {
      fireEvent.pointerDown(
        canvas,
        pointerEvent({ button: 0, buttons: 1, clientX: x, clientY: y }),
      );
      fireEvent.pointerMove(
        canvas,
        pointerEvent({
          button: -1,
          buttons: 1,
          clientX: x + 60,
          clientY: y + 60,
        }),
      );
      fireEvent.pointerUp(
        canvas,
        pointerEvent({
          button: 0,
          buttons: 0,
          clientX: x + 60,
          clientY: y + 60,
        }),
      );
    };

    // Контроль: харнесс умеет рисовать до пана.
    leftDraw(100, 100);
    expect(h.elements.length).toBe(1);

    rightGesture([
      [340, 340],
      [380, 380],
    ]);

    act(() => {
      h.app.setActiveTool({ type: "rectangle" });
    });
    leftDraw(200, 200);
    expect(h.elements.length).toBe(2);
  });

  // Гонка быстрого флика (flush после teardown) живёт в отдельном файле
  // rightButtonPanRace.test.tsx: глобальный мок throttleRAF в setupTests
  // синхронный и структурно скрывает её здесь.

  it("a second right-click after a right-drag opens the menu again (flag resets)", () => {
    rightGesture([
      [340, 340],
      [380, 380],
    ]);
    expect(h.state.contextMenu).toBeNull();

    rightGesture([]);
    expect(h.state.contextMenu).not.toBeNull();
  });
});
