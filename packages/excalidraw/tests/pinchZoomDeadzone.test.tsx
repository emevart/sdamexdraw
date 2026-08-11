import React from "react";

import { Excalidraw } from "../index";

import { Pointer } from "./helpers/ui";
import {
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  waitFor,
} from "./test-utils";

const { h } = window;

/**
 * Мёртвая зона масштабирования: перемещение двумя пальцами не должно попутно
 * менять масштаб от дрожания руки (репро founder на iPad, 2026-08-11).
 */
describe("мёртвая зона пинч-зума", () => {
  beforeEach(() => {
    mockBoundingClientRect();
  });

  afterEach(() => {
    restoreOriginalGetBoundingClientRect();
  });

  it("параллельное перемещение двумя пальцами не меняет масштаб", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const zoomBefore = h.state.zoom.value;
    const scrollBefore = h.state.scrollX;

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    finger1.downAt(40, 50);
    finger2.downAt(120, 50);

    // строго параллельно: расстояние между пальцами не меняется
    for (let step = 0; step < 5; step++) {
      finger1.move(6, 4);
      finger2.move(6, 4);
    }

    expect(h.state.zoom.value).toBe(zoomBefore);
    expect(h.state.scrollX).not.toBe(scrollBefore);

    finger1.up();
    finger2.up();
  });

  it("дрожание в пределах мёртвой зоны не будит масштаб", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const zoomBefore = h.state.zoom.value;

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    // пальцы в 100 px друг от друга -> мёртвая зона 6% = 6 px
    finger1.downAt(40, 50);
    finger2.downAt(140, 50);

    // ведём вниз, слегка «дыша» пальцами: расстояние гуляет в пределах зоны
    finger1.move(-2, 5);
    finger2.move(2, 5);
    finger1.move(2, 5);
    finger2.move(-2, 5);
    finger1.move(-1, 5);
    finger2.move(1, 5);

    expect(h.state.zoom.value).toBe(zoomBefore);

    finger1.up();
    finger2.up();
  });

  it("осознанное разведение пальцев масштаб включает", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const zoomBefore = h.state.zoom.value;

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    finger1.downAt(60, 50);
    finger2.downAt(140, 50);

    // разводим далеко за порог
    finger1.move(-25, 0);
    finger2.move(25, 0);

    expect(h.state.zoom.value).toBeGreaterThan(zoomBefore);

    finger1.up();
    finger2.up();
  });

  it("сразу за порогом отклик мягкий, без рывка", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    finger1.downAt(60, 50);
    finger2.downAt(160, 50);

    // заметно за грань: пальцы разошлись на 18 px при базе 100 px = 18%
    finger1.move(-9, 0);
    finger2.move(9, 0);

    // масштаб тронулся, но НЕ на все 18%: зона съедает свои 6%, и вблизи
    // порога отклик ещё и разгоняется плавно -- рывка в момент перехода нет
    const zoomAtEngage = h.state.zoom.value;
    expect(zoomAtEngage).toBeGreaterThan(1);
    expect(zoomAtEngage).toBeLessThan(1.18);

    // дальше разводим по-настоящему
    finger1.move(-30, 0);
    finger2.move(30, 0);
    expect(h.state.zoom.value).toBeGreaterThan(zoomAtEngage);

    finger1.up();
    finger2.up();
  });

  it("новый жест снова начинается как чистое перемещение", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    // первый жест: зумим
    finger1.downAt(60, 50);
    finger2.downAt(140, 50);
    finger1.move(-25, 0);
    finger2.move(25, 0);
    finger1.up();
    finger2.up();

    const zoomAfterFirst = h.state.zoom.value;

    // второй жест: только перемещение
    const finger3 = new Pointer("touch", 3);
    const finger4 = new Pointer("touch", 4);
    finger3.downAt(40, 50);
    finger4.downAt(120, 50);
    finger3.move(5, 5);
    finger4.move(5, 5);

    expect(h.state.zoom.value).toBe(zoomAfterFirst);

    finger3.up();
    finger4.up();
  });
});
