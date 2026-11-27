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

describe("Procreate QuickShape improvements (circles, ellipses, rectangles, overshoot)", () => {
  it("snaps a wobbly closed stroke to a true uniform circle and preserves seam closure", () => {
    const pts: LocalPoint[] = [];
    const cx = 200;
    const cy = 200;
    const r = 100;
    for (let i = 0; i <= 72; i++) {
      const angle = (i / 72) * (Math.PI * 2 - 0.08);
      const jitter = i % 5 === 0 ? 6 : i % 3 === 0 ? -5 : 2;
      pts.push(
        pointFrom<LocalPoint>(
          cx + (r + jitter) * Math.cos(angle),
          cy + (r - jitter * 0.7) * Math.sin(angle),
        ),
      );
    }

    const result = computeStraightenResult(pts, 1);
    expect(result).not.toBeNull();
    expect(result!.animationTargets).toHaveLength(pts.length);

    const out = result!.finalPoints;
    expect(pointDistance(out[0], out[out.length - 1])).toBeLessThan(1e-6);

    // Every point of finalPoints should sit on a uniform circle around centroid
    const midX =
      out.slice(0, -1).reduce((s, p) => s + p[0], 0) / (out.length - 1);
    const midY =
      out.slice(0, -1).reduce((s, p) => s + p[1], 0) / (out.length - 1);
    const radii = out
      .slice(0, -1)
      .map((p) => Math.hypot(p[0] - midX, p[1] - midY));
    const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
    for (const rad of radii) {
      expect(Math.abs(rad - meanR)).toBeLessThan(1e-3);
    }
  });

  it("snaps a rotated oval stroke to an oriented ellipse", () => {
    const pts: LocalPoint[] = [];
    const cx = 180;
    const cy = 140;
    const rx = 120;
    const ry = 60;
    const rot = Math.PI / 6;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * (Math.PI * 2 - 0.06);
      const wobble = i % 4 === 0 ? 4 : -3;
      const lx = (rx + wobble) * Math.cos(a);
      const ly = (ry - wobble * 0.5) * Math.sin(a);
      pts.push(
        pointFrom<LocalPoint>(
          cx + lx * cos - ly * sin,
          cy + lx * sin + ly * cos,
        ),
      );
    }

    const result = computeStraightenResult(pts, 1);
    expect(result).not.toBeNull();
    const out = result!.finalPoints;
    expect(pointDistance(out[0], out[out.length - 1])).toBeLessThan(1e-6);

    // Verify all points satisfy an ellipse equation (major axis ~120, minor ~60)
    const maxDistFromCenter = Math.max(
      ...out.map((p) => Math.hypot(p[0] - cx, p[1] - cy)),
    );
    const minDistFromCenter = Math.min(
      ...out.map((p) => Math.hypot(p[0] - cx, p[1] - cy)),
    );
    expect(maxDistFromCenter).toBeGreaterThan(105);
    expect(minDistFromCenter).toBeLessThan(70);
  });

  it("closes a circle even when the pen overshoots past the starting point", () => {
    const pts: LocalPoint[] = [];
    const cx = 150;
    const cy = 150;
    const r = 90;
    for (let i = 0; i <= 70; i++) {
      // Goes 25% past 2*PI so end is far from start
      const a = (i / 70) * (Math.PI * 2.22);
      pts.push(
        pointFrom<LocalPoint>(cx + r * Math.cos(a), cy + r * Math.sin(a)),
      );
    }

    const result = computeStraightenResult(pts, 1);
    expect(result).not.toBeNull();
    expect(result!.animationTargets).toHaveLength(pts.length);
    const out = result!.finalPoints;
    expect(pointDistance(out[0], out[out.length - 1])).toBeLessThan(1);
  });

  it("detects corners regardless of dense stylus sampling rate (240Hz rectangle)", () => {
    const sampleSide = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      steps: number,
      skipFirst: boolean,
    ) => {
      const list: LocalPoint[] = [];
      for (let i = skipFirst ? 1 : 0; i <= steps; i++) {
        const t = i / steps;
        const wobble = Math.sin(t * Math.PI * 4) * 2;
        list.push(
          pointFrom<LocalPoint>(
            x0 + (x1 - x0) * t + wobble * 0.3,
            y0 + (y1 - y0) * t + wobble * 0.3,
          ),
        );
      }
      return list;
    };

    // High sample density: 50 samples per side (~4px step), starting right at top-left corner
    const pts: LocalPoint[] = [
      ...sampleSide(0, 0, 200, 0, 50, false),
      ...sampleSide(200, 0, 200, 120, 40, true),
      ...sampleSide(200, 120, 0, 120, 50, true),
      ...sampleSide(0, 120, 4, 3, 40, true),
    ];

    const result = computeStraightenResult(pts, 1);
    expect(result).not.toBeNull();
    expect(result!.animationTargets).toHaveLength(pts.length);
    const out = result!.finalPoints;
    expect(pointDistance(out[0], out[out.length - 1])).toBeLessThan(1e-6);

    // Points should align strictly along axis-aligned rectangle perimeter (4 sharp corners)
    const xs = out.map((p) => p[0]);
    const ys = out.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    expect(maxX - minX).toBeGreaterThan(190);
    expect(maxY - minY).toBeGreaterThan(110);
    for (const [x, y] of out) {
      const onVertical = Math.abs(x - minX) < 1.5 || Math.abs(x - maxX) < 1.5;
      const onHorizontal = Math.abs(y - minY) < 1.5 || Math.abs(y - maxY) < 1.5;
      expect(onVertical || onHorizontal).toBe(true);
    }
  });
});
