import { pointDistance, pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import {
  computeStraightenResult,
  getAutoCloseThreshold,
  getFreedrawTransformScale,
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
