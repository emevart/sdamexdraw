import React from "react";
import { vi } from "vitest";

import {
  STRAIGHTEN_ANIMATION_DURATION,
  STRAIGHTEN_HOLD_TIME,
} from "@excalidraw/common";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";
import { computeStraightenResult } from "../straighten";

import { Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

import type { NormalizedZoomValue } from "../types";

// sdamex billion-dollars#6066 (F4): hold-to-straighten is a hold of the
// pointer within a few screen pixels, not a pause between new samples, and
// the transform mode after it does not lose or overreact to small moves.

const { h } = window;

const mouse = new Pointer("mouse", 41);

const freedrawElements = () =>
  h.elements.filter(
    (el): el is ExcalidrawFreeDrawElement =>
      el.type === "freedraw" && !el.isDeleted,
  );

const drawingPoints = () =>
  (h.state.newElement as ExcalidrawFreeDrawElement).points;

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const setZoom = (value: number) =>
  act(() => {
    h.setState({
      zoom: { value: value as NormalizedZoomValue },
      scrollX: 0,
      scrollY: 0,
    });
  });

/** A wavy, nearly horizontal stroke 200 px long on screen. */
const drawWavyLine = () => {
  mouse.downAt(100, 200);
  for (let i = 1; i < 20; i++) {
    mouse.moveTo(100 + i * 10, 200 + (i % 2 ? 4 : -4));
  }
  mouse.moveTo(300, 200);
};

/** Hand tremor around (x, y): a new point every 50 ms, `amplitude` px off. */
const tremble = (x: number, y: number, amplitude: number, ms: number) => {
  for (let t = 50, i = 0; t <= ms; t += 50, i++) {
    advance(50);
    const dx = i % 2 ? amplitude : 0;
    const dy = i % 3 === 1 ? amplitude / 2 : 0;
    mouse.moveTo(x + dx, y + dy);
  }
};

const expectPointsEqual = (
  actual: readonly LocalPoint[],
  expected: readonly LocalPoint[],
) => {
  expect(actual.length).toBe(expected.length);
  actual.forEach((point, i) => {
    expect(point[0]).toBeCloseTo(expected[i][0], 6);
    expect(point[1]).toBeCloseTo(expected[i][1], 6);
  });
};

describe("hold-to-straighten: hold radius in screen pixels (billion-dollars #6066)", () => {
  let animateStraighten: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    vi.useFakeTimers();
    animateStraighten = vi.spyOn(h.app as any, "animateStraighten");
  });

  afterEach(() => {
    if (h.state.newElement) {
      mouse.upAt();
    }
    animateStraighten.mockRestore();
    vi.useRealTimers();
  });

  it("holding with a tremor of 2 px straightens, although every tremor is a new point", () => {
    drawWavyLine();
    const pointsBefore = drawingPoints().length;
    tremble(300, 200, 2, STRAIGHTEN_HOLD_TIME + 100);
    expect(drawingPoints().length).toBeGreaterThan(pointsBefore + 5);
    expect(animateStraighten).toHaveBeenCalledTimes(1);
  });

  it.each([0.5, 1, 3])(
    "the hold radius is in screen pixels at zoom %s",
    (zoom) => {
      setZoom(zoom);
      drawWavyLine();
      // 2 px on screen: a hold at any zoom
      tremble(300, 200, 2, STRAIGHTEN_HOLD_TIME + 100);
      expect(animateStraighten).toHaveBeenCalledTimes(1);
    },
  );

  it("a tremor wider than the radius is not a hold, also at zoom 3", () => {
    // at zoom 3 a tremor of 6 px is 2 scene units: a hold, were the radius
    // in scene units
    setZoom(3);
    drawWavyLine();
    tremble(300, 200, 6, 3 * STRAIGHTEN_HOLD_TIME);
    expect(animateStraighten).not.toHaveBeenCalled();
  });

  it("slow drawing with pauses without new points does not straighten", () => {
    drawWavyLine();
    // 2 px every 100 ms (20 px/s), and after every third step a pause of
    // 250 ms where the pointer reports the same position again
    let x = 300;
    for (let i = 0; i < 30; i++) {
      x += 2;
      mouse.moveTo(x, 200);
      advance(100);
      if (i % 3 === 2) {
        for (let t = 0; t < 250; t += 25) {
          mouse.moveTo(x, 200);
          advance(25);
        }
      }
    }
    expect(animateStraighten).not.toHaveBeenCalled();
  });

  it("a still pointer without any samples still straightens after the hold", () => {
    drawWavyLine();
    advance(STRAIGHTEN_HOLD_TIME);
    expect(animateStraighten).toHaveBeenCalledTimes(1);
  });
});

describe("hold-to-straighten: moves during and after the animation (billion-dollars #6066)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (h.state.newElement) {
      mouse.upAt();
    }
    vi.useRealTimers();
  });

  it("a move during the animation is applied when the transform mode starts", () => {
    drawWavyLine();
    advance(STRAIGHTEN_HOLD_TIME);
    advance(70);
    // mid-animation: rotate the line around its first point by 90 degrees
    mouse.moveTo(100, 400);
    advance(STRAIGHTEN_ANIMATION_DURATION + 50);

    const element = h.state.newElement as ExcalidrawFreeDrawElement;
    const last = element.points[element.points.length - 1];
    expect(element.x + element.points[0][0]).toBeCloseTo(100, 6);
    expect(element.y + element.points[0][1]).toBeCloseTo(200, 6);
    expect(element.x + last[0]).toBeCloseTo(100, 6);
    expect(element.y + last[1]).toBeCloseTo(400, 6);

    mouse.upAt(100, 400);
    const [committed] = freedrawElements();
    const committedLast = committed.points[committed.points.length - 1];
    expect(committed.y + committedLast[1]).toBeCloseTo(400, 6);
  });

  it("the transform dead zone is in screen pixels: 4 px at zoom 0.5 keeps the line", () => {
    setZoom(0.5);
    drawWavyLine();
    const target = computeStraightenResult([...drawingPoints()], 0.5)!;
    expect(target).not.toBeNull();
    advance(STRAIGHTEN_HOLD_TIME);
    advance(STRAIGHTEN_ANIMATION_DURATION + 50);

    // 4 px on screen = 8 scene units at zoom 0.5
    mouse.moveTo(300, 204);
    expectPointsEqual(drawingPoints(), target.finalPoints);

    mouse.upAt(300, 204);
    const [committed] = freedrawElements();
    expectPointsEqual(committed.points, target.finalPoints);
  });

  it("past the dead zone the line follows the pointer", () => {
    setZoom(0.5);
    drawWavyLine();
    advance(STRAIGHTEN_HOLD_TIME);
    advance(STRAIGHTEN_ANIMATION_DURATION + 50);

    mouse.moveTo(100, 400);
    const element = h.state.newElement as ExcalidrawFreeDrawElement;
    const last = element.points[element.points.length - 1];
    // screen (100, 400) at zoom 0.5 = scene (200, 800)
    expect(element.x + last[0]).toBeCloseTo(200, 6);
    expect(element.y + last[1]).toBeCloseTo(800, 6);
    mouse.upAt(100, 400);
  });
});
