import { pointDistance, pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import {
  computeStraightenResult,
  getAutoCloseThreshold,
  getFreedrawTransformScale,
  pathLength,
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

    expect(getAutoCloseThreshold(points)).toBeLessThan(5);
    const result = computeStraightenResult(points);

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

/** A letter "o" of `diameter`, drawn from the top clockwise to 350 degrees. */
const letterO = (diameter: number) => {
  const r = diameter / 2;
  const points: LocalPoint[] = [];
  for (let deg = 0; deg <= 350; deg += 10) {
    const a = (deg * Math.PI) / 180;
    points.push(
      pointFrom<LocalPoint>(r + r * Math.sin(a), r - r * Math.cos(a)),
    );
  }
  return points;
};

const endGap = (points: readonly LocalPoint[]) =>
  pointDistance(points[0], points[points.length - 1]);

describe("auto-close by the size of the stroke on screen (sdamex #6066)", () => {
  it("a 30 px letter does not close, though its gap is under the size threshold", () => {
    const points = letterO(30);
    // the gap is within the old size-relative threshold and the path is
    // longer than 3 thresholds: before #6066 the letter closed
    expect(endGap(points)).toBeLessThan(getAutoCloseThreshold(points));
    expect(pathLength(points)).toBeGreaterThan(90);

    const result = computeStraightenResult(points);

    expect(result).not.toBeNull();
    expect(endGap(result!.finalPoints)).toBeGreaterThan(1);
  });

  it("the size is measured on screen: a 30 px letter at 50% zoom does not close", () => {
    // 60 scene px at zoom 0.5 is 30 px on screen
    const points = letterO(60);

    const result = computeStraightenResult(points, 0.5);

    expect(result).not.toBeNull();
    expect(endGap(result!.finalPoints)).toBeGreaterThan(1);
  });

  it("a large loop still closes, at 100% and at 300% zoom", () => {
    expect(
      endGap(computeStraightenResult(letterO(200))!.finalPoints),
    ).toBeLessThan(1);
    // 40 scene px at 300% is 120 px on screen
    expect(
      endGap(computeStraightenResult(letterO(40), 3)!.finalPoints),
    ).toBeLessThan(1);
  });

  it("a large loop drawn at 25% zoom is small on screen and does not close", () => {
    // 200 scene px at zoom 0.25 is 50 px on screen
    const points = letterO(200);

    expect(
      endGap(computeStraightenResult(points, 0.25)!.finalPoints),
    ).toBeGreaterThan(1);
  });
});
