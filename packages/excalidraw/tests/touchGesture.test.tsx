import React from "react";

import { Excalidraw } from "../index";

import { Pointer } from "./helpers/ui";
import {
  GlobalTestState,
  fireEvent,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  waitFor,
} from "./test-utils";

const { h } = window;

// touchType -- iOS-only поле Touch: "direct" для пальца, "stylus" для пера.
// jsdom его не синтезирует, поэтому подставляем руками (как в tabletInputPolicy).
const directTouch = (identifier: number, clientX: number, clientY: number) =>
  ({ identifier, clientX, clientY, touchType: "direct" } as unknown as Touch);
const stylusTouch = (identifier: number, clientX: number, clientY: number) =>
  ({ identifier, clientX, clientY, touchType: "stylus" } as unknown as Touch);

/**
 * Два пальца, шлющие ОДНО событие с обеими координатами -- в отличие от
 * хелпера `Pointer`, который шлёт по событию на палец.
 */
class TwoFingerGesture {
  constructor(
    private a: { x: number; y: number },
    private b: { x: number; y: number },
    private readonly make = directTouch,
  ) {}

  private touches() {
    return [this.make(1, this.a.x, this.a.y), this.make(2, this.b.x, this.b.y)];
  }

  start() {
    const touches = this.touches();
    fireEvent.touchStart(GlobalTestState.interactiveCanvas, {
      touches,
      changedTouches: touches,
    });
    // первый touchmove задаёт точку отсчёта и ничего не двигает
    fireEvent.touchMove(GlobalTestState.interactiveCanvas, {
      touches: this.touches(),
    });
  }

  /** сдвигает ОБА пальца на один и тот же вектор -- чистый перенос */
  pan(dx: number, dy: number) {
    this.a = { x: this.a.x + dx, y: this.a.y + dy };
    this.b = { x: this.b.x + dx, y: this.b.y + dy };
    fireEvent.touchMove(GlobalTestState.interactiveCanvas, {
      touches: this.touches(),
    });
  }

  /** разводит пальцы вдоль их линии на 2 * amount */
  spread(amount: number) {
    this.a = { x: this.a.x - amount, y: this.a.y };
    this.b = { x: this.b.x + amount, y: this.b.y };
    fireEvent.touchMove(GlobalTestState.interactiveCanvas, {
      touches: this.touches(),
    });
  }

  end() {
    fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
      touches: [],
      changedTouches: this.touches(),
    });
  }
}

describe("двупальцевый жест по touchmove", () => {
  beforeEach(() => {
    mockBoundingClientRect();
  });

  afterEach(() => {
    restoreOriginalGetBoundingClientRect();
  });

  it("[доказательство] pointer-путь врёт масштабом при чистом переносе", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    // пальцы на одной горизонтали, переносим ОБА вдоль их линии
    finger1.downAt(40, 60);
    finger2.downAt(120, 60);

    const zoomBefore = h.state.zoom.value;

    // события приходят по одному на палец -- расстояние между ними меряется
    // по разновозрастным координатам и «дышит»
    finger1.move(20, 0);
    const zoomMidGesture = h.state.zoom.value;

    // ЭТО И ЕСТЬ БАГ: пальцы не сближались, а масштаб уже поехал
    expect(zoomMidGesture).not.toBe(zoomBefore);

    finger1.up();
    finger2.up();
  });

  it("touch-путь: чистый перенос не меняет масштаб вовсе", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const zoomBefore = h.state.zoom.value;
    const scrollBefore = { x: h.state.scrollX, y: h.state.scrollY };

    const gesture = new TwoFingerGesture({ x: 40, y: 60 }, { x: 120, y: 60 });
    gesture.start();

    // тот же самый перенос вдоль линии пальцев, но одним событием
    gesture.pan(20, 0);
    expect(h.state.zoom.value).toBe(zoomBefore);

    gesture.pan(10, 7);
    gesture.pan(-5, 3);
    expect(h.state.zoom.value).toBe(zoomBefore);

    // и дрожание пальцев в пределах порога намерения тоже не будит масштаб
    gesture.spread(3);
    gesture.spread(-3);
    gesture.spread(2);
    expect(h.state.zoom.value).toBe(zoomBefore);

    // и холст при этом действительно поехал
    expect({ x: h.state.scrollX, y: h.state.scrollY }).not.toEqual(
      scrollBefore,
    );

    gesture.end();
  });

  it("touch-путь: холст следует за пальцем один к одному", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    expect(h.state.zoom.value).toBe(1);
    const scrollBefore = { x: h.state.scrollX, y: h.state.scrollY };

    const gesture = new TwoFingerGesture({ x: 40, y: 60 }, { x: 120, y: 60 });
    gesture.start();
    gesture.pan(30, -20);

    // при zoom = 1 сдвиг сцены равен сдвигу пальца; множителя 2 быть не должно
    expect(h.state.scrollX - scrollBefore.x).toBeCloseTo(30, 5);
    expect(h.state.scrollY - scrollBefore.y).toBeCloseTo(-20, 5);

    gesture.end();
  });

  it("touch-путь: осознанное разведение пальцев масштабирует", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const zoomBefore = h.state.zoom.value;

    const gesture = new TwoFingerGesture({ x: 60, y: 60 }, { x: 140, y: 60 });
    gesture.start();

    // первый кадр за порогом ПРИЗНАЁТ намерение и переносит точку отсчёта --
    // масштаб на нём ещё не двигается, чтобы не было скачка на всю накопленную
    // дельту. Зум идёт со следующего кадра.
    gesture.spread(20);
    gesture.spread(20);

    expect(h.state.zoom.value).toBeGreaterThan(zoomBefore);

    gesture.end();
  });

  it("перо не ведёт камеру: touch-путь пропускает stylus", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const scrollBefore = { x: h.state.scrollX, y: h.state.scrollY };

    const gesture = new TwoFingerGesture(
      { x: 40, y: 60 },
      { x: 120, y: 60 },
      stylusTouch,
    );
    gesture.start();
    gesture.pan(30, 30);

    expect({ x: h.state.scrollX, y: h.state.scrollY }).toEqual(scrollBefore);

    gesture.end();
  });

  it("после жеста состояние сбрасывается: следующий жест начинается заново", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const first = new TwoFingerGesture({ x: 40, y: 60 }, { x: 120, y: 60 });
    first.start();
    first.spread(20);
    first.spread(20);
    first.end();

    const zoomAfterFirst = h.state.zoom.value;

    const second = new TwoFingerGesture({ x: 40, y: 60 }, { x: 120, y: 60 });
    second.start();
    second.pan(10, 10);

    // второй жест -- чистый перенос, масштаб первого не должен пересчитаться
    expect(h.state.zoom.value).toBe(zoomAfterFirst);

    second.end();
  });
});
