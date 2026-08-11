import React from "react";

import { Excalidraw } from "../index";

import { getNormalizedZoom } from "../scene";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import {
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  waitFor,
} from "./test-utils";

const { h } = window;

/**
 * Холст обязан ехать ровно на столько, на сколько уехал палец.
 *
 * Репро founder на iPad: «при перемещении на одном пальце как будто
 * несоразмерно перемещению пальца передвигаюсь». Причина -- объектная форма
 * setState: абсолютная цель считалась от `this.state`, отстающего на кадр.
 */
describe("соразмерность панорамирования", () => {
  beforeEach(() => {
    mockBoundingClientRect();
    Pointer.resetAll();
  });

  afterEach(() => {
    restoreOriginalGetBoundingClientRect();
  });

  it("один палец: сумма шагов равна пройденному пальцем пути", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    React.act(() => {
      h.app.setActiveTool({ type: "hand" });
    });
    expect(h.state.zoom.value).toBe(1);

    const before = { x: h.state.scrollX, y: h.state.scrollY };

    const finger = new Pointer("touch", 1);
    finger.downAt(60, 60);

    // десять шагов подряд, как при живом ведении пальца
    for (let step = 0; step < 10; step++) {
      finger.move(4, -3);
    }
    finger.up();

    // при zoom = 1 сцена смещается ровно на путь пальца
    expect(h.state.scrollX - before.x).toBeCloseTo(40, 5);
    expect(h.state.scrollY - before.y).toBeCloseTo(-30, 5);
  });

  it("один палец: соразмерность сохраняется на увеличенном масштабе", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    React.act(() => {
      h.app.setActiveTool({ type: "hand" });
    });
    API.setAppState({ zoom: { value: getNormalizedZoom(2) } });

    const zoom = h.state.zoom.value;
    expect(zoom).toBe(2);
    const before = { x: h.state.scrollX, y: h.state.scrollY };

    const finger = new Pointer("touch", 2);
    finger.downAt(60, 60);
    for (let step = 0; step < 5; step++) {
      finger.move(6, 6);
    }
    finger.up();

    // экранный путь 30 px -> сцена смещается на 30 / zoom
    expect(h.state.scrollX - before.x).toBeCloseTo(30 / zoom, 5);
    expect(h.state.scrollY - before.y).toBeCloseTo(30 / zoom, 5);
  });
});
