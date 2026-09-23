import type { LocalPoint, Radians } from "@excalidraw/math";

import {
  getFreedrawOutlinePoints,
  getFreedrawStrokeRadius,
} from "../src/shape";

import type { ExcalidrawFreeDrawElement } from "../src/types";

const freedraw = (points: LocalPoint[]): ExcalidrawFreeDrawElement =>
  ({
    id: "fd-end",
    type: "freedraw",
    x: 0,
    y: 0,
    width: 400,
    height: 100,
    angle: 0 as Radians,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
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
    points,
    pressures: [],
    simulatePressure: true,
    lastCommittedPoint: null,
  } as unknown as ExcalidrawFreeDrawElement);

const xs = (element: ExcalidrawFreeDrawElement) =>
  getFreedrawOutlinePoints(element).map(([x]) => x);

// sparse fast stroke from #3043: a long last jump before pointerup
const SPARSE = [
  [0, 0],
  [200, 0],
  [400, 0],
] as LocalPoint[];

describe("freedraw stroke end (sdamex #3043)", () => {
  it("ink reaches the pointerup point of a sparse fast stroke", () => {
    const element = freedraw(SPARSE);
    const maxX = Math.max(...xs(element));

    expect(maxX).toBeGreaterThanOrEqual(400 - 0.01);
    expect(maxX).toBeLessThanOrEqual(400 + getFreedrawStrokeRadius(element));
  });

  it("a repeated pointerup point does not bring the lag back", () => {
    const element = freedraw([...SPARSE, [400, 0]] as LocalPoint[]);

    expect(Math.max(...xs(element))).toBeGreaterThanOrEqual(400 - 0.01);
  });

  it("keeps the start at the raw pointerdown point", () => {
    const element = freedraw(SPARSE);
    const minX = Math.min(...xs(element));

    expect(minX).toBeLessThanOrEqual(0.01);
    expect(minX).toBeGreaterThanOrEqual(-getFreedrawStrokeRadius(element));
  });

  it("still smooths interior points", () => {
    const element = freedraw([
      [0, 0],
      [100, 100],
      [200, 0],
      [300, 0],
    ] as LocalPoint[]);
    const maxY = Math.max(
      ...getFreedrawOutlinePoints(element).map(([, y]) => y),
    );

    expect(maxY).toBeLessThan(100);
  });

  // live drawing re-renders the outline from all points on every pointermove,
  // so every prefix of a stroke is a frame the author and collaborators see
  // (accepted variant B, see the plan decision 1)
  it("the tip follows the pointer on every live frame of a bending stroke", () => {
    const CURVE = [
      [0, 0],
      [150, 0],
      [250, 100],
      [250, 250],
    ] as LocalPoint[];

    for (let k = 2; k <= CURVE.length; k++) {
      const element = freedraw(CURVE.slice(0, k));
      const [px, py] = CURVE[k - 1];
      const tipDistance = Math.min(
        ...getFreedrawOutlinePoints(element).map(([x, y]) =>
          Math.hypot(x - px, y - py),
        ),
      );

      expect(tipDistance).toBeLessThanOrEqual(
        getFreedrawStrokeRadius(element) + 0.01,
      );
    }
  });
});
