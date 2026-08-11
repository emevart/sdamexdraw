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

const directTouch = (identifier: number, clientX: number, clientY: number) =>
  ({ identifier, clientX, clientY, touchType: "direct" } as unknown as Touch);

/**
 * На реальном устройстве браузер шлёт ОБА потока: pointer-события по одному
 * на палец И touchmove со всеми касаниями. Стенд, шлющий только touch,
 * этого не проверяет -- а именно здесь может проявиться дрожание.
 */
class RealTwoFingerStream {
  private p1 = new Pointer("touch", 1);
  private p2 = new Pointer("touch", 2);

  constructor(
    private a: { x: number; y: number },
    private b: { x: number; y: number },
  ) {}

  private touches() {
    return [
      directTouch(1, this.a.x, this.a.y),
      directTouch(2, this.b.x, this.b.y),
    ];
  }

  private fireTouch(type: "touchStart" | "touchMove") {
    const touches = this.touches();
    fireEvent[type](GlobalTestState.interactiveCanvas, {
      touches,
      changedTouches: touches,
    });
  }

  start() {
    // порядок как на iOS: pointerdown раньше touchstart
    this.p1.downAt(this.a.x, this.a.y);
    fireEvent.touchStart(GlobalTestState.interactiveCanvas, {
      touches: [directTouch(1, this.a.x, this.a.y)],
      changedTouches: [directTouch(1, this.a.x, this.a.y)],
    });
    this.p2.downAt(this.b.x, this.b.y);
    this.fireTouch("touchStart");
    // первый кадр задаёт точку отсчёта
    this.fireTouch("touchMove");
  }

  /** кадр движения: pointermove на каждый палец, затем touchmove с обоими */
  pan(dx: number, dy: number) {
    this.a = { x: this.a.x + dx, y: this.a.y + dy };
    this.b = { x: this.b.x + dx, y: this.b.y + dy };
    this.p1.moveTo(this.a.x, this.a.y);
    this.p2.moveTo(this.b.x, this.b.y);
    this.fireTouch("touchMove");
  }

  end() {
    this.p1.up();
    this.p2.up();
    fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
      touches: [],
      changedTouches: this.touches(),
    });
  }
}

describe("реальный поток событий: pointer + touch вместе", () => {
  beforeEach(() => {
    mockBoundingClientRect();
    Pointer.resetAll();
  });

  afterEach(() => {
    restoreOriginalGetBoundingClientRect();
  });

  it("чистый перенос не меняет масштаб", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const zoomBefore = h.state.zoom.value;

    const stream = new RealTwoFingerStream({ x: 40, y: 60 }, { x: 120, y: 60 });
    stream.start();

    stream.pan(15, 0);
    expect(h.state.zoom.value).toBe(zoomBefore);

    stream.pan(12, 6);
    stream.pan(-8, 4);
    expect(h.state.zoom.value).toBe(zoomBefore);

    stream.end();
  });

  it("холст едет ровно на сдвиг пальца, без удвоения", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    expect(h.state.zoom.value).toBe(1);
    const before = { x: h.state.scrollX, y: h.state.scrollY };

    const stream = new RealTwoFingerStream({ x: 40, y: 60 }, { x: 120, y: 60 });
    stream.start();
    stream.pan(20, -10);

    expect(h.state.scrollX - before.x).toBeCloseTo(20, 5);
    expect(h.state.scrollY - before.y).toBeCloseTo(-10, 5);

    stream.end();
  });
});
