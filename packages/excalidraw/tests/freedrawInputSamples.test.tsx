import React from "react";

import {
  ShapeCache,
  elementWithCanvasCache,
  getFreedrawPenInk,
} from "@excalidraw/element";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { Pointer } from "./helpers/ui";
import { act, GlobalTestState, render, unmountComponent } from "./test-utils";

const { h } = window;

type RawSample = {
  clientX: number;
  clientY: number;
  pressure: number;
  timeStamp?: number;
};

const dispatchRawMove = (
  pointerType: "mouse" | "pen",
  pointerId: number,
  clientX: number,
  clientY: number,
  pressure: number,
  coalesced: RawSample[],
  timeStamp?: number,
) => {
  const event = new Event("pointermove", { bubbles: true }) as PointerEvent;
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
    pressure: { value: pressure },
    ...(timeStamp === undefined ? {} : { timeStamp: { value: timeStamp } }),
    getCoalescedEvents: {
      value: () =>
        coalesced.map(
          (sample) =>
            ({
              ...sample,
              pointerType,
              pointerId,
            } as PointerEvent),
        ),
    },
  });
  act(() => {
    GlobalTestState.interactiveCanvas.dispatchEvent(event);
  });
};

describe.each([
  ["mouse", 71, 0.5],
  ["pen", 72, 0.65],
] as const)("freedraw raw %s samples", (pointerType, pointerId, pressure) => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
  });

  it("keeps coalesced samples and ignores moves from another pointer", () => {
    const pointer = new Pointer(pointerType, pointerId);
    pointer.downAt(100, 200);

    // A palm/second finger can move before the pen's next browser event. It
    // belongs to a different pointer session and must never enter this stroke.
    dispatchRawMove(
      pointerType === "pen" ? "mouse" : "pen",
      999,
      500,
      500,
      0.5,
      [{ clientX: 500, clientY: 500, pressure: 0.5 }],
    );

    // Vitest makes throttleRAF synchronous, so one event carries several real
    // device samples. The old latest-event path kept only (130, 206).
    dispatchRawMove(pointerType, pointerId, 130, 206, pressure, [
      { clientX: 110, clientY: 202, pressure },
      { clientX: 120, clientY: 204, pressure },
      { clientX: 130, clientY: 206, pressure },
    ]);
    pointer.upAt(140, 208);

    const element = h.elements.find(
      (candidate): candidate is ExcalidrawFreeDrawElement =>
        candidate.type === "freedraw" && !candidate.isDeleted,
    );
    expect(element).toBeDefined();
    expect(element!.points).toEqual([
      [0, 0],
      [10, 2],
      [20, 4],
      [30, 6],
      [40, 8],
    ]);
  });
});

// sdamex #5706: Safari on iPadOS re-delivers in getCoalescedEvents() samples of
// the previous pointermove and one it held back (WebKit #316105: x 100, 101,
// 102, 104, then 101, 102, 103, 104). Pen ink v2 drops them within a touch;
// the legacy ink keeps every sample, as 0.30.9.
describe("re-delivered coalesced samples (sdamex #5706)", () => {
  const PRESSURE = [0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17];
  // the pen goes right 10 px per sample from (100, 200)
  const at = (k: number, time?: number): RawSample => ({
    clientX: 100 + 10 * k,
    clientY: 200 + 2 * k,
    pressure: PRESSURE[k],
    ...(time === undefined ? {} : { timeStamp: time }),
  });

  const findStroke = () =>
    h.elements.find(
      (candidate): candidate is ExcalidrawFreeDrawElement =>
        candidate.type === "freedraw" && !candidate.isDeleted,
    )!;

  const drawOverlapping = (timed: boolean) => {
    const pointer = new Pointer("pen", 72);
    pointer.downAt(100, 200);
    const t0 = h.app.lastPointerDownEvent!.nativeEvent.timeStamp;
    const time = (k: number) => (timed ? t0 + 4 * k : undefined);
    // first pointermove: samples 1, 2, 4 (3 held back); the pointerup point
    // at 6 ends every stroke
    dispatchRawMove("pen", 72, 140, 208, PRESSURE[4], [
      at(1, time(1)),
      at(2, time(2)),
      at(4, time(4)),
    ]);
    // the next one: 2, 3, 4 again, then the new 5, 6
    dispatchRawMove("pen", 72, 160, 212, PRESSURE[6], [
      at(2, time(2)),
      at(3, time(3)),
      at(4, time(4)),
      at(5, time(5)),
      at(6, time(6)),
    ]);
    pointer.upAt(160, 212);
    return findStroke();
  };

  const steps = (element: ExcalidrawFreeDrawElement) =>
    element.points.slice(1).map((point, i) => point[0] - element.points[i][0]);

  describe("pen ink v2", () => {
    beforeEach(async () => {
      unmountComponent();
      await render(<Excalidraw handleKeyboardGlobally={true} penInk="v2" />);
      Pointer.resetAll();
      act(() => {
        h.app.setActiveTool({ type: "freedraw" });
      });
    });

    it("drops samples not newer than the previous pointermove", () => {
      expect(getFreedrawPenInk()).toBe("v2");
      const element = drawOverlapping(true);

      expect(element.points.map(([x]) => x)).toEqual([
        0, 10, 20, 40, 50, 60, 60,
      ]);
      expect(element.pressures.slice(1, 6)).toEqual([
        PRESSURE[1],
        PRESSURE[2],
        PRESSURE[4],
        PRESSURE[5],
        PRESSURE[6],
      ]);
      // no step back: no chord across the arc of a frame
      expect(Math.min(...steps(element))).toBeGreaterThanOrEqual(-3);
    });

    it("without sample times, drops a re-delivered stretch by its repeats", () => {
      const element = drawOverlapping(false);

      expect(element.points.map(([x]) => x)).toEqual([
        0, 10, 20, 40, 50, 60, 60,
      ]);
      expect(Math.min(...steps(element))).toBeGreaterThanOrEqual(-3);
    });

    it("keeps distinct samples of one coarse time and drops an exact repeat of it", () => {
      const pointer = new Pointer("pen", 72);
      pointer.downAt(100, 200);
      const t = h.app.lastPointerDownEvent!.nativeEvent.timeStamp + 1;
      // a browser without coalesced events, a 1 ms clock
      dispatchRawMove("pen", 72, 110, 202, PRESSURE[1], [], t);
      dispatchRawMove("pen", 72, 120, 204, PRESSURE[2], [], t);
      dispatchRawMove("pen", 72, 120, 204, PRESSURE[2], [at(1, t), at(2, t)]);
      dispatchRawMove("pen", 72, 130, 206, PRESSURE[3], [], t + 1);
      pointer.upAt(130, 206);

      expect(findStroke().points.map(([x]) => x)).toEqual([0, 10, 20, 30, 30]);
    });

    it("draws the stroke being drawn without an element canvas per frame", () => {
      const pointer = new Pointer("pen", 72);
      pointer.downAt(100, 200);
      const t0 = h.app.lastPointerDownEvent!.nativeEvent.timeStamp;
      for (let k = 1; k <= 40; k++) {
        dispatchRawMove(
          "pen",
          72,
          100 + 5 * k,
          200 + 20 * Math.sin(k / 3),
          0.2,
          [],
          t0 + 4 * k,
        );
      }
      const drawn = h.state.newElement as ExcalidrawFreeDrawElement;
      expect(drawn.points.length).toBeGreaterThan(30);
      // legacy rasterizes the whole stroke into a new element canvas on
      // every frame; v2 draws the frozen part from a layer and the end
      expect(elementWithCanvasCache.get(drawn)).toBeUndefined();
      pointer.upAt(305, 200);
    });
  });

  describe("legacy pen ink", () => {
    beforeEach(async () => {
      unmountComponent();
      await render(<Excalidraw handleKeyboardGlobally={true} />);
      Pointer.resetAll();
      act(() => {
        h.app.setActiveTool({ type: "freedraw" });
      });
    });

    it("keeps every sample, as 0.30.9", () => {
      expect(getFreedrawPenInk()).toBe("legacy");
      const element = drawOverlapping(true);

      expect(element.points.map(([x]) => x)).toEqual([
        0, 10, 20, 40, 20, 30, 40, 50, 60, 60,
      ]);
    });

    it("rasterizes the stroke being drawn into an element canvas, as 0.30.9", () => {
      const pointer = new Pointer("pen", 72);
      pointer.downAt(100, 200);
      for (let k = 1; k <= 10; k++) {
        dispatchRawMove("pen", 72, 100 + 5 * k, 200, 0.2, []);
      }
      const drawn = h.state.newElement as ExcalidrawFreeDrawElement;
      expect(elementWithCanvasCache.get(drawn)).toBeDefined();
      pointer.upAt(150, 200);
    });
  });

  it("follows the penInk prop after mount and drops the cached pen shapes", async () => {
    unmountComponent();
    const { rerender } = await render(
      <Excalidraw handleKeyboardGlobally={true} />,
    );
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    const pointer = new Pointer("pen", 72);
    pointer.downAt(100, 200);
    for (let k = 1; k <= 10; k++) {
      dispatchRawMove("pen", 72, 100 + 5 * k, 200 + k, 0.2, []);
    }
    pointer.upAt(150, 210);
    const element = findStroke();
    ShapeCache.generateElementShape(element, null);
    expect(ShapeCache.get(element, null)).toBeDefined();
    expect(getFreedrawPenInk()).toBe("legacy");

    // the host flag arrives later
    rerender(<Excalidraw handleKeyboardGlobally={true} penInk="v2" />);
    expect(getFreedrawPenInk()).toBe("v2");
    expect(ShapeCache.get(element, null)).toBeUndefined();
    expect(elementWithCanvasCache.get(element)?.freedrawInk).not.toBe("legacy");

    rerender(<Excalidraw handleKeyboardGlobally={true} penInk="legacy" />);
    expect(getFreedrawPenInk()).toBe("legacy");
  });
});
