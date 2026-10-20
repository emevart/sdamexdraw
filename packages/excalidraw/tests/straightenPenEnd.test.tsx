import React from "react";
import { vi } from "vitest";

import {
  STRAIGHTEN_ANIMATION_DURATION,
  STRAIGHTEN_HOLD_TIME,
} from "@excalidraw/common";
import { pointDistance } from "@excalidraw/math";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";
import { maxDeviationFromLine } from "../straighten";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

import type { NormalizedZoomValue } from "../types";

const { h } = window;

const mouse = new Pointer("mouse", 32);

const freedrawElements = () =>
  h.elements.filter(
    (el): el is ExcalidrawFreeDrawElement =>
      el.type === "freedraw" && !el.isDeleted,
  );

const drawingElement = () => h.state.newElement as ExcalidrawFreeDrawElement;

/** Scene position of the last point of a freedraw element. */
const endOf = (element: ExcalidrawFreeDrawElement) => {
  const last = element.points[element.points.length - 1];
  return [element.x + last[0], element.y + last[1]] as const;
};

const setZoom = (value: number) => {
  API.setAppState({
    zoom: { value: value as NormalizedZoomValue },
    scrollX: 0,
    scrollY: 0,
  });
};

/** A wavy, nearly horizontal stroke from (100, 200) to (300, 200) on screen. */
const drawWavyLine = () => {
  mouse.downAt(100, 200);
  for (let i = 1; i < 20; i++) {
    mouse.moveTo(100 + i * 10, 200 + (i % 2 ? 4 : -4));
  }
  mouse.moveTo(300, 200);
};

/**
 * A letter "o" of radius `r` on screen from its top (x, y), drawn clockwise
 * to 350 degrees: the end is 0.17 r from the start.
 */
const drawLetterO = (x: number, y: number, r: number) => {
  mouse.downAt(x, y);
  for (let deg = 10; deg <= 350; deg += 10) {
    const a = (deg * Math.PI) / 180;
    mouse.moveTo(x + r * Math.sin(a), y + r - r * Math.cos(a));
  }
};

/** Holds the pen until the straighten animation has finished. */
const holdUntilStraightened = () => {
  act(() => {
    vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME);
  });
  act(() => {
    vi.advanceTimersByTime(STRAIGHTEN_ANIMATION_DURATION + 50);
  });
};

describe("pen end of a line after hold-to-straighten (sdamex #6066)", () => {
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
    vi.useRealTimers();
  });

  it("at 300% zoom the end follows a 4 px move of the pen (no dead zone in scene px)", () => {
    setZoom(3);
    drawWavyLine();
    holdUntilStraightened();
    expect(maxDeviationFromLine(drawingElement().points)).toBeCloseTo(0, 6);

    // 4 screen px further along the line: 1.33 scene px at 300%
    mouse.moveTo(304, 200);

    const [x, y] = endOf(drawingElement());
    expect(x).toBeCloseTo(304 / 3, 6);
    expect(y).toBeCloseTo(200 / 3, 6);

    mouse.upAt(304, 200);
    const [element] = freedrawElements();
    expect(endOf(element)[0]).toBeCloseTo(304 / 3, 6);
  });

  it("a jitter of the pen inside the move threshold keeps the line still", () => {
    setZoom(3);
    drawWavyLine();
    holdUntilStraightened();
    const before = [...drawingElement().points];

    mouse.moveTo(302, 201);

    expect(drawingElement().points).toEqual(before);
    mouse.upAt(302, 201);
  });

  it("moving the pen during the animation ends it at once and the end follows the pen", () => {
    drawWavyLine();
    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME);
    });
    act(() => {
      vi.advanceTimersByTime(70);
    });
    // mid-animation, not yet straight
    expect(maxDeviationFromLine(drawingElement().points)).toBeGreaterThan(0.5);

    mouse.moveTo(310, 200);

    const element = drawingElement();
    expect(maxDeviationFromLine(element.points)).toBeCloseTo(0, 6);
    const [x, y] = endOf(element);
    expect(x).toBeCloseTo(310, 6);
    expect(y).toBeCloseTo(200, 6);

    mouse.upAt(310, 200);
    const [committed] = freedrawElements();
    expect(freedrawElements().length).toBe(1);
    expect(endOf(committed)[0]).toBeCloseTo(310, 6);
    expect(maxDeviationFromLine(committed.points)).toBeCloseTo(0, 6);
  });

  it("a pen drift inside the move threshold during the animation does not end it", () => {
    drawWavyLine();
    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME);
    });
    act(() => {
      vi.advanceTimersByTime(70);
    });
    const midAnimation = [...drawingElement().points];

    mouse.moveTo(301, 201);

    expect(drawingElement().points).toEqual(midAnimation);
    mouse.upAt(301, 201);
  });

  it("a slow end of a line (a sample every 400 ms) does not straighten it (guard)", () => {
    drawWavyLine();
    for (let i = 1; i <= 5; i++) {
      act(() => {
        vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME - 100);
      });
      mouse.moveTo(300 + i, 200);
    }
    const drawn = [...drawingElement().points];
    expect(maxDeviationFromLine(drawn)).toBeGreaterThan(3);

    mouse.upAt(305, 200);

    const [element] = freedrawElements();
    expect(element.points.length).toBe(drawn.length + 1);
    expect(maxDeviationFromLine(element.points)).toBeGreaterThan(3);
  });

  it("a 30 px letter does not close on release, without a hold", () => {
    drawLetterO(400, 300, 15);
    mouse.upAt();

    const [element] = freedrawElements();
    const points = element.points as readonly LocalPoint[];
    expect(pointDistance(points[0], points[points.length - 1])).toBeGreaterThan(
      1,
    );
  });

  it("a large loop with a small gap still closes on release (unchanged)", () => {
    drawLetterO(400, 200, 100);
    // 5 px before the start: inside the 8 px loop threshold of finalize
    mouse.moveTo(395, 200);
    mouse.upAt();

    const [element] = freedrawElements();
    const points = element.points as readonly LocalPoint[];
    expect(pointDistance(points[0], points[points.length - 1])).toBe(0);
  });

  it("a 30 px letter written at 50% zoom does not close on hold", () => {
    setZoom(0.5);
    // 30 screen px (60 scene px)
    drawLetterO(400, 300, 15);
    holdUntilStraightened();
    mouse.upAt();

    const [element] = freedrawElements();
    const points = element.points as readonly LocalPoint[];
    expect(pointDistance(points[0], points[points.length - 1])).toBeGreaterThan(
      1,
    );
  });
});
