import { pointDistance, pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import {
  computeStraightenResult,
  getAutoCloseThreshold,
  getFreedrawTransformScale,
  getStraightenHoldRadius,
} from "./straighten";

describe("freedraw straightening", () => {
  it("does not close a compact open stroke just because the gap is small", () => {
    const points = [
      [0, 0],
      [20, 0],
      [0, 5],
      [20, 10],
      [0, 15],
      [20, 20],
      [0, 20],
      [20, 15],
      [0, 10],
      [20, 5],
      [5, 0],
    ].map(([x, y]) => pointFrom<LocalPoint>(x, y));

    // 20 x 20 is below the minimum size on screen at zoom 1
    // (billion-dollars#6066); at zoom 2 it is 40 px and gets smoothed
    expect(getAutoCloseThreshold(points, 2)).toBeLessThan(5);
    const result = computeStraightenResult(points, 2);

    expect(result).not.toBeNull();
    expect(
      pointDistance(
        result!.finalPoints[0],
        result!.finalPoints[result!.finalPoints.length - 1],
      ),
    ).toBeGreaterThan(1);
  });

  it("still closes an intentional larger loop", () => {
    const points = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [4, 2],
    ].map(([x, y]) => pointFrom<LocalPoint>(x, y));

    const result = computeStraightenResult(points);

    expect(result).not.toBeNull();
    expect(
      pointDistance(
        result!.finalPoints[0],
        result!.finalPoints[result!.finalPoints.length - 1],
      ),
    ).toBeLessThan(1);
  });

  it("allows very small and large transform scales", () => {
    expect(getFreedrawTransformScale(0, 100)).toBe(0.01);
    expect(getFreedrawTransformScale(1000, 1)).toBe(100);
  });
});

// sdamex billion-dollars#6066 (F5): the close and straighten thresholds are
// screen pixels. A digit drawn 28 px high on screen is the same mark at any
// zoom: at zoom 0.5 it is 56 scene units, at zoom 3 about 9.
describe("freedraw straightening: thresholds in screen pixels (billion-dollars #6066)", () => {
  const ZOOMS = [0.5, 1, 3];

  /** Arc around (cx, cy) from angle a0 to a1 (radians), screen pixels. */
  const arc = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    a0: number,
    a1: number,
    steps: number,
  ): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return out;
  };

  // Handwriting in screen pixels, y down, about 18 x 28 px: a digit or
  // a letter written on a board.
  const GLYPHS: Record<string, [number, number][]> = {
    // the letter "о": an oval whose end stops about 2 px short of its start
    o: arc(9, 14, 9, 13, -Math.PI / 2, (3 * Math.PI) / 2 - 0.15, 40),
    // "6": the stem from the top right down the left side, then the bowl
    "6": [
      ...arc(18, 18, 16, 18, -Math.PI / 2 + 0.3, -Math.PI, 12),
      ...arc(10, 20, 8, 8, Math.PI, 3 * Math.PI - 0.3, 30),
    ],
    // "9": the bowl at the top, back to its start, then the tail down
    "9": [
      ...arc(9, 8, 8, 8, 0, 2 * Math.PI, 30),
      ...arc(1, 8, 16, 20, 0, Math.PI / 2 - 0.2, 12),
    ],
  };

  /** Screen-pixel points as local scene points at the given zoom. */
  const atZoom = (screen: [number, number][], zoom: number) =>
    screen.map(([x, y]) =>
      pointFrom<LocalPoint>(
        (x - screen[0][0]) / zoom,
        (y - screen[0][1]) / zoom,
      ),
    );

  // 200 px across, the end about 10 px short of the start
  const bigCircle = () => arc(100, 100, 100, 100, 0, 2 * Math.PI - 0.1, 80);

  for (const [name, glyph] of Object.entries(GLYPHS)) {
    for (const zoom of ZOOMS) {
      it(`"${name}" written on screen is neither closed nor straightened at zoom ${zoom}`, () => {
        expect(computeStraightenResult(atZoom(glyph, zoom), zoom)).toBeNull();
      });
    }
  }

  for (const zoom of ZOOMS) {
    it(`a big circle on screen closes at zoom ${zoom}`, () => {
      const result = computeStraightenResult(atZoom(bigCircle(), zoom), zoom);
      expect(result).not.toBeNull();
      const pts = result!.finalPoints;
      expect(pointDistance(pts[0], pts[pts.length - 1])).toBeLessThan(1);
    });
  }

  it("the close threshold is the same on screen at any zoom", () => {
    const screenThresholds = ZOOMS.map(
      (zoom) => getAutoCloseThreshold(atZoom(bigCircle(), zoom), zoom) * zoom,
    );
    expect(screenThresholds[0]).toBeGreaterThan(5);
    for (const threshold of screenThresholds) {
      expect(threshold).toBeCloseTo(screenThresholds[0], 6);
    }
  });

  it("a wavy line long on screen straightens at any zoom", () => {
    const wavy: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      wavy.push([i * 10, i % 2 ? 4 : -4]);
    }
    for (const zoom of ZOOMS) {
      const result = computeStraightenResult(atZoom(wavy, zoom), zoom);
      expect(result).not.toBeNull();
      const pts = result!.finalPoints;
      const [sx, sy] = pts[0];
      const [ex, ey] = pts[pts.length - 1];
      for (const [x, y] of pts) {
        // on the segment from the first point to the last
        expect(
          Math.abs((ex - sx) * (y - sy) - (ey - sy) * (x - sx)),
        ).toBeLessThan(1e-6);
      }
    }
  });
});

// sdamex billion-dollars#6066 (F4): how far the pointer may wander and still
// hold for straightening, in screen pixels. A finger tremors more than a pen
// tip or a mouse.
describe("freedraw straightening: hold radius by pointer type (billion-dollars #6066)", () => {
  it("is 5 px for a finger", () => {
    expect(getStraightenHoldRadius("touch")).toBe(5);
  });

  it.each(["mouse", "pen", "", undefined])("is 3 px for %j", (pointerType) => {
    expect(getStraightenHoldRadius(pointerType)).toBe(3);
  });

  it("is wider for a finger than for a pen", () => {
    expect(getStraightenHoldRadius("touch")).toBeGreaterThan(
      getStraightenHoldRadius("pen"),
    );
  });
});
