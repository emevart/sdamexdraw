import { arrayToMap } from "@excalidraw/common";

import type { LocalPoint, Radians } from "@excalidraw/math";

import {
  getElementAbsoluteCoords,
  getElementBounds,
  getResizedElementAbsoluteCoords,
} from "../src/bounds";
import {
  getFreedrawOutlinePoints,
  getFreedrawStrokeRadius,
} from "../src/shape";

import type { ExcalidrawFreeDrawElement } from "../src/types";

const WAVY_POINTS: LocalPoint[] = [
  [0, 0],
  [50, 4],
  [100, 0],
  [150, 4],
  [200, 6],
] as LocalPoint[];

const freedraw = (
  overrides: Partial<ExcalidrawFreeDrawElement> = {},
): ExcalidrawFreeDrawElement =>
  ({
    id: "fd-test",
    type: "freedraw",
    x: 100,
    y: 100,
    width: 200,
    height: 6,
    angle: 0 as Radians,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 12,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    points: WAVY_POINTS,
    pressures: [],
    simulatePressure: true,
    lastCommittedPoint: null,
  } as unknown as ExcalidrawFreeDrawElement);

/** AABB of the actually rendered ink (outline polygon), in scene coords. */
const getInkBounds = (element: ExcalidrawFreeDrawElement) => {
  const outline = getFreedrawOutlinePoints(element);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outline) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [
    minX + element.x,
    minY + element.y,
    maxX + element.x,
    maxY + element.y,
  ] as const;
};

describe("freedraw bounds cover the rendered ink", () => {
  it("highlighter-width stroke (strokeWidth 12): element bounds contain the outline", () => {
    const element = freedraw();
    const [inkX1, inkY1, inkX2, inkY2] = getInkBounds(element);
    const [x1, y1, x2, y2] = getElementBounds(element, arrayToMap([element]));

    expect(x1).toBeLessThanOrEqual(inkX1);
    expect(y1).toBeLessThanOrEqual(inkY1);
    expect(x2).toBeGreaterThanOrEqual(inkX2);
    expect(y2).toBeGreaterThanOrEqual(inkY2);
  });

  it("regular pencil (strokeWidth 4): element bounds contain the outline", () => {
    const element = freedraw({ strokeWidth: 4 });
    const [inkX1, inkY1, inkX2, inkY2] = getInkBounds(element);
    const [x1, y1, x2, y2] = getElementBounds(element, arrayToMap([element]));

    expect(x1).toBeLessThanOrEqual(inkX1);
    expect(y1).toBeLessThanOrEqual(inkY1);
    expect(x2).toBeGreaterThanOrEqual(inkX2);
    expect(y2).toBeGreaterThanOrEqual(inkY2);
  });

  it("rotated stroke (45deg): rotated bounds still contain the rotated ink", () => {
    const element = freedraw({ angle: (Math.PI / 4) as Radians });
    const [x1, y1, x2, y2] = getElementBounds(element, arrayToMap([element]));

    // the ink outline is generated in local coords; rotate it around the
    // element center the same way calculateBounds rotates the points
    const outline = getFreedrawOutlinePoints({
      ...element,
      angle: 0 as Radians,
    } as ExcalidrawFreeDrawElement);
    const [ax1, ay1, ax2, ay2] = getElementAbsoluteCoords(
      { ...element, angle: 0 } as ExcalidrawFreeDrawElement,
      arrayToMap([element]),
    );
    const cx = (ax1 + ax2) / 2;
    const cy = (ay1 + ay2) / 2;
    const cos = Math.cos(element.angle);
    const sin = Math.sin(element.angle);
    for (const [lx, ly] of outline) {
      const gx = lx + element.x;
      const gy = ly + element.y;
      const rx = (gx - cx) * cos - (gy - cy) * sin + cx;
      const ry = (gx - cx) * sin + (gy - cy) * cos + cy;
      expect(rx).toBeGreaterThanOrEqual(x1 - 0.001);
      expect(ry).toBeGreaterThanOrEqual(y1 - 0.001);
      expect(rx).toBeLessThanOrEqual(x2 + 0.001);
      expect(ry).toBeLessThanOrEqual(y2 + 0.001);
    }
  });

  it("padding equals the ink radius derived from strokeWidth", () => {
    const element = freedraw();
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(
      element,
      arrayToMap([element]),
    );
    const radius = getFreedrawStrokeRadius(element);

    expect(x1).toBeCloseTo(element.x + 0 - radius, 5);
    expect(y1).toBeCloseTo(element.y + 0 - radius, 5);
    expect(x2).toBeCloseTo(element.x + 200 + radius, 5);
    expect(y2).toBeCloseTo(element.y + 6 + radius, 5);
  });

  it("resize-start coords equal element absolute coords (no handle jump)", () => {
    const element = freedraw();
    const abs = getElementAbsoluteCoords(element, arrayToMap([element]));
    const resized = getResizedElementAbsoluteCoords(
      element,
      element.width,
      element.height,
      true,
    );

    expect(resized[0]).toBeCloseTo(abs[0], 5);
    expect(resized[1]).toBeCloseTo(abs[1], 5);
    expect(resized[2]).toBeCloseTo(abs[2], 5);
    expect(resized[3]).toBeCloseTo(abs[3], 5);
  });

  it("rectangle bounds are unaffected (control)", () => {
    const rect = {
      ...freedraw(),
      type: "rectangle",
      points: undefined,
      pressures: undefined,
      simulatePressure: undefined,
    } as any;
    const [x1, y1, x2, y2] = getElementBounds(rect, arrayToMap([rect]));

    expect([x1, y1, x2, y2]).toEqual([100, 100, 300, 106]);
  });
});
