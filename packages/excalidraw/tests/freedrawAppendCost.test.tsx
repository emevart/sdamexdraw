import React from "react";
import { vi } from "vitest";

import { STRAIGHTEN_HOLD_TIME } from "@excalidraw/common";
import { pointFrom } from "@excalidraw/math";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";

import { Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

// The canvas of the stroke in progress is not drawn here: the legacy ink
// redraws the whole outline on every frame and the canvas mock keeps every
// call, so a long stroke would measure the renderer and run out of memory.
// This file measures the move handler (and the React update it triggers).
vi.mock("../renderer/renderNewElementScene", () => ({
  renderNewElementScene: () => {},
  renderNewElementSceneThrottled: Object.assign(() => {}, {
    flush: () => {},
    cancel: () => {},
  }),
}));

const { h } = window;

const mouse = new Pointer("mouse", 41);

const drawing = () => h.state.newElement as ExcalidrawFreeDrawElement;

/** Starts a stroke and grows it to `length` points without the handler. */
const startStroke = (length: number) => {
  mouse.downAt(100, 100);
  mouse.moveTo(101, 101);
  const element = drawing();
  const points: LocalPoint[] = [];
  for (let i = 0; i < length; i++) {
    // a zigzag inside a 400 x 40 box: the stroke size stops changing
    points.push(pointFrom<LocalPoint>(i % 400, (i * 7) % 40));
  }
  act(() => {
    h.app.scene.mutateElement(
      element,
      { points, pressures: [] },
      { informMutation: false, isDragging: false },
    );
  });
  return element;
};

/** Mean ms per pointermove that appends one point, for a stroke of `length`. */
const msPerAppend = (length: number, moves: number) => {
  startStroke(length);
  mouse.moveTo(149, 119);
  const start = performance.now();
  for (let i = 0; i < moves; i++) {
    mouse.moveTo(150 + (i % 50), 120 + (i % 2));
  }
  const ms = (performance.now() - start) / moves;
  mouse.upAt(150, 120);
  return ms;
};

describe("freedraw: appending points to a long stroke (billion-dollars #6066)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
  });

  afterEach(() => {
    // a failed assertion leaves the stroke open: end it, so the hold timer
    // and the pointer do not leak into the next test
    if (h.state.newElement) {
      mouse.upAt(150, 120);
    }
  });

  it("does not copy the points of the stroke on every move", () => {
    const element = startStroke(1000);
    mouse.moveTo(150, 120);
    const points = element.points;
    const version = element.version;
    const nonce = element.versionNonce;

    mouse.moveTo(151, 121);

    expect(element.points).toBe(points);
    expect(element.points.length).toBe(1002);
    expect(element.points[1001][0]).toBe(51);
    expect(element.points[1001][1]).toBe(21);
    // the renderer and the stores still see a change
    expect(element.version).toBeGreaterThan(version);
    expect(element.versionNonce).not.toBe(nonce);
    expect(element.width).toBe(399);
    expect(element.height).toBe(39);
    mouse.upAt(151, 121);
  });

  it("arms the hold timer once, not on every move", () => {
    startStroke(10);
    mouse.moveTo(150, 120);
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    try {
      for (let i = 0; i < 50; i++) {
        mouse.moveTo(151 + i, 120);
      }
      const holdTimers = setTimeoutSpy.mock.calls.filter(
        ([, delay]) => delay === STRAIGHTEN_HOLD_TIME,
      );
      expect(holdTimers.length).toBe(0);
      expect(clearTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
    mouse.upAt(200, 120);
  });

  it("straightens a full hold after the last new point, not after the first timer", () => {
    vi.useFakeTimers();
    const animateStraighten = vi.spyOn(h.app as any, "animateStraighten");
    try {
      // a wavy line, long enough to straighten; the first point arms the
      // hold timer at t = 0
      mouse.downAt(100, 200);
      for (let i = 1; i < 20; i++) {
        mouse.moveTo(100 + i * 10, 200 + (i % 2 ? 4 : -4));
      }

      act(() => {
        vi.advanceTimersByTime(300);
      });
      // a new point at t = 300: the hold now ends at t = 800
      mouse.moveTo(300, 200);

      act(() => {
        vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME - 300);
      });
      // t = 500: the first timer fired and waits for the rest of the hold
      expect(animateStraighten).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(299);
      });
      // t = 799
      expect(animateStraighten).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      // t = 800: a full hold after the last new point
      expect(animateStraighten).toHaveBeenCalledTimes(1);
    } finally {
      animateStraighten.mockRestore();
      vi.useRealTimers();
    }
  });

  it("time per point does not grow with the length of the stroke", () => {
    // The main check is that the points are not copied (test above). This
    // one is coarse on purpose, so it does not flake on a busy machine:
    // copying 60k points per move was 4x slower than 1k (9.5 vs 2.2 ms)
    // warm-up: JIT and first-render costs
    msPerAppend(1000, 200);

    const short = msPerAppend(1000, 400);
    const long = msPerAppend(60_000, 400);
    // eslint-disable-next-line no-console
    console.info(
      `[#6066 F3] ms per point: 1k points ${short.toFixed(
        4,
      )}, 60k points ${long.toFixed(4)}`,
    );
    expect(long).toBeLessThan(short * 3);
  });
});
