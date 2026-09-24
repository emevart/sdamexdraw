import React from "react";
import { vi } from "vitest";

import {
  STRAIGHTEN_ANIMATION_DURATION,
  STRAIGHTEN_HOLD_TIME,
} from "@excalidraw/common";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";
import { computeStraightenResult, maxDeviationFromLine } from "../straighten";

import { Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse", 31);

const freedrawElements = () =>
  h.elements.filter(
    (el): el is ExcalidrawFreeDrawElement =>
      el.type === "freedraw" && !el.isDeleted,
  );

const drawingPoints = () =>
  (h.state.newElement as ExcalidrawFreeDrawElement).points;

/** A wavy, nearly horizontal stroke: straightens to a line. */
const drawWavyLine = () => {
  mouse.downAt(100, 200);
  for (let i = 1; i < 20; i++) {
    mouse.moveTo(100 + i * 10, 200 + (i % 2 ? 4 : -4));
  }
  mouse.moveTo(300, 200);
};

/** A quarter circle: too curved for a line, gets smoothed instead. */
const drawArc = () => {
  mouse.downAt(100, 200);
  for (let i = 1; i <= 24; i++) {
    const angle = (i / 24) * (Math.PI / 2);
    const wobble = i % 2 ? 3 : -3;
    mouse.moveTo(
      100 + (150 + wobble) * Math.sin(angle),
      200 + 150 - (150 + wobble) * Math.cos(angle),
    );
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

describe("hold-to-straighten: release during the animation (sdamex #5176)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    // setTimeout (hold timer), requestAnimationFrame and performance.now
    // (animation clock) run on the fake clock
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("release mid-animation commits the straight line, without the release point", () => {
    drawWavyLine();
    const drawn = [...drawingPoints()];
    const target = computeStraightenResult(drawn)!;
    expect(target).not.toBeNull();
    expect(maxDeviationFromLine(target.finalPoints)).toBeCloseTo(0, 6);

    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME);
    });
    act(() => {
      vi.advanceTimersByTime(70);
    });

    // mid-animation: already moving, not yet straight
    const midDeviation = maxDeviationFromLine(drawingPoints());
    expect(midDeviation).toBeLessThan(maxDeviationFromLine(drawn));
    expect(midDeviation).toBeGreaterThan(0.5);

    // the pen drifted a little while the stroke was animating
    mouse.upAt(305, 206);

    expect(h.state.newElement).toBe(null);
    const [element] = freedrawElements();
    expect(freedrawElements().length).toBe(1);
    expectPointsEqual(element.points, target.finalPoints);
    expect(maxDeviationFromLine(element.points)).toBeCloseTo(0, 6);
    expect(element.pressures.length).toBeLessThanOrEqual(
      target.finalPoints.length,
    );
  });

  it("release mid-animation commits the smoothed curve, without the release point", () => {
    drawArc();
    const drawn = [...drawingPoints()];
    const target = computeStraightenResult(drawn)!;
    expect(target).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME);
    });
    act(() => {
      vi.advanceTimersByTime(70);
    });

    mouse.upAt(260, 360);

    const [element] = freedrawElements();
    expect(freedrawElements().length).toBe(1);
    expectPointsEqual(element.points, target.finalPoints);
  });

  it("release after the animation keeps the straightened line (unchanged)", () => {
    drawWavyLine();
    const target = computeStraightenResult([...drawingPoints()])!;

    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME);
    });
    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_ANIMATION_DURATION + 50);
    });

    mouse.upAt(300, 200);

    const [element] = freedrawElements();
    expectPointsEqual(element.points, target.finalPoints);
  });

  it("moving after the animation transforms the line and release keeps it (unchanged)", () => {
    drawWavyLine();
    const target = computeStraightenResult([...drawingPoints()])!;

    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME);
    });
    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_ANIMATION_DURATION + 50);
    });

    // rotate the line around its first point by 90 degrees
    mouse.moveTo(100, 400);
    mouse.upAt(100, 400);

    const [element] = freedrawElements();
    expect(element.points.length).toBe(target.finalPoints.length);
    const first = element.points[0];
    const last = element.points[element.points.length - 1];
    expect(element.x + first[0]).toBeCloseTo(100, 6);
    expect(element.y + first[1]).toBeCloseTo(200, 6);
    expect(element.x + last[0]).toBeCloseTo(100, 6);
    expect(element.y + last[1]).toBeCloseTo(400, 6);
  });

  it("release before the hold fires keeps the raw stroke with the release point (unchanged)", () => {
    drawWavyLine();
    const drawn = [...drawingPoints()];

    act(() => {
      vi.advanceTimersByTime(STRAIGHTEN_HOLD_TIME - 100);
    });

    mouse.upAt(305, 206);

    const [element] = freedrawElements();
    expect(element.points.length).toBe(drawn.length + 1);
    expectPointsEqual(element.points.slice(0, drawn.length), drawn);
  });
});
