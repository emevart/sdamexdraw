import type { LocalPoint, Radians } from "@excalidraw/math";

import { getFreedrawCenterline, getFreedrawPenWidth } from "../src/freedrawInk";
import {
  getFreedrawOutlinePoints,
  getFreedrawStrokeRadius,
  setFreedrawPenInk,
} from "../src/shape";

import type { ExcalidrawFreeDrawElement } from "../src/types";

// Synthetic Apple Pencil strokes recorded the way the editor records them
// (emevart/billion-dollars#5706): points relative to the pointerdown point,
// identical neighbours skipped, the pointerup point repeated with pressure 0.
// The tests of 0.30.10; its centerline is the centerline of pen ink v2.

type Sample = [x: number, y: number, pressure: number];

const record = (
  path: (t: number) => [number, number],
  pressure: (t: number) => number,
  duration: number,
  hz: number,
  /** Safari before 26.2 rounds pointer coordinates to whole pixels */
  wholePixels: boolean,
) => {
  const samples: Sample[] = [];
  for (let k = 0; k <= Math.floor(duration * hz); k++) {
    const t = k / hz;
    const [x, y] = path(t);
    samples.push(
      wholePixels
        ? [Math.round(x), Math.round(y), pressure(t)]
        : [x, y, pressure(t)],
    );
  }
  const [ox, oy] = samples[0];
  const points: LocalPoint[] = [];
  const pressures: number[] = [];
  for (const [x, y, p] of samples) {
    const last = points[points.length - 1];
    if (last && last[0] === x - ox && last[1] === y - oy) {
      continue;
    }
    points.push([x - ox, y - oy] as LocalPoint);
    pressures.push(p);
  }
  const last = points[points.length - 1];
  points.push([last[0], last[1]] as LocalPoint);
  pressures.push(0);
  return { points, pressures, origin: [ox, oy] as const };
};

const freedraw = (
  points: readonly LocalPoint[],
  pressures: readonly number[],
  overrides: Partial<ExcalidrawFreeDrawElement> = {},
): ExcalidrawFreeDrawElement =>
  ({
    id: "fd-pen",
    type: "freedraw",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    angle: 0 as Radians,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
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
    pressures,
    simulatePressure: false,
    lastCommittedPoint: null,
    ...overrides,
  } as unknown as ExcalidrawFreeDrawElement);

/** Ink half-width across a horizontal stroke at x (scanline of the outline). */
const halfWidthAt = (outline: [number, number][], x: number) => {
  let top = Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) {
      const y = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return (bottom - top) / 2;
};

describe("pen ink v2 along a smoothed centerline (sdamex #5706)", () => {
  beforeAll(() => {
    setFreedrawPenInk("v2");
  });
  afterAll(() => {
    setFreedrawPenInk("legacy");
  });

  // very fast circles, 60 samples a second, lifted mid-turn: the old
  // streamline smoothing lagged inside the circle, and the raw last point
  // (#3043) closed the gap with a straight "tangent" tail
  it("a fast circle stays on the circle and ends without a straight tail", () => {
    const R = 45;
    const circle = (t: number): [number, number] => {
      const a = (2 * Math.PI * t) / 0.16;
      return [80 + R * Math.cos(a), 70 + R * Math.sin(a)];
    };
    const { points, pressures, origin } = record(
      circle,
      () => 0.25,
      0.62,
      60,
      true,
    );
    const element = freedraw(points, pressures);
    const inkRadius = getFreedrawStrokeRadius(element);
    const cx = 80 - origin[0];
    const cy = 70 - origin[1];

    for (const [x, y] of getFreedrawOutlinePoints(element)) {
      const offCircle = Math.abs(Math.hypot(x - cx, y - cy) - R);
      expect(offCircle).toBeLessThanOrEqual(inkRadius + 1.5);
    }
  });

  // slow handwriting at 240 samples a second in whole pixels comes as a
  // staircase; the edge of the ink must stay straight along a straight line
  it("a staircase of whole-pixel samples gives a straight edge", () => {
    const slope = 0.3;
    const { points, pressures } = record(
      (t) => [10 + 120 * t, 10 + 120 * slope * t],
      () => 0.25,
      2,
      240,
      true,
    );
    const element = freedraw(points, pressures);
    const length = Math.hypot(240, 240 * slope);
    const nx = -slope / Math.hypot(1, slope);
    const ny = 1 / Math.hypot(1, slope);
    const ux = 1 / Math.hypot(1, slope);
    const uy = slope / Math.hypot(1, slope);
    const above: number[] = [];
    const below: number[] = [];
    for (const [x, y] of getFreedrawOutlinePoints(element)) {
      const along = x * ux + y * uy;
      if (along < 12 || along > length - 12) {
        continue; // caps
      }
      const across = x * nx + y * ny;
      (across > 0 ? above : below).push(across);
    }
    const spread = (values: number[]) =>
      Math.max(...values) - Math.min(...values);

    expect(spread(above)).toBeLessThan(0.3);
    expect(spread(below)).toBeLessThan(0.3);
  });

  // Safari reports the Apple Pencil force over its maximum: a hand writes at
  // about 0.05..0.3, where the old curve with its 1.1 px floor was flat
  it("the working pressure range of an Apple Pencil gives visibly different widths", () => {
    const { points, pressures } = record(
      (t) => [10 + 260 * t, 40],
      (t) => 0.05 + 0.3 * t,
      1,
      240,
      false,
    );
    const outline = getFreedrawOutlinePoints(freedraw(points, pressures));
    // pressures 0.08 and 0.32
    const light = halfWidthAt(outline, 26);
    const firm = halfWidthAt(outline, 234);

    expect(firm / light).toBeGreaterThan(1.6);
    expect(firm - light).toBeGreaterThan(0.6);
  });

  it("the width curve: light to full, the full width from pressure 0.6", () => {
    expect(getFreedrawPenWidth(0)).toBeCloseTo(0.3, 6);
    expect(getFreedrawPenWidth(0.6)).toBeCloseTo(1, 6);
    expect(getFreedrawPenWidth(1)).toBeCloseTo(1, 6);
    expect(getFreedrawPenWidth(0.25)).toBeGreaterThan(
      getFreedrawPenWidth(0.1) + 0.15,
    );
  });

  // a mouse (simulated pressure) and a finger without force (iOS reports 0)
  // keep the even widths they had before #5706
  it("mouse and finger strokes keep their width", () => {
    const line = record(
      (t) => [10 + 200 * t, 40],
      () => 0,
      1,
      240,
      false,
    );
    const mouse = freedraw(line.points, [], { simulatePressure: true });
    const finger = freedraw(line.points, line.pressures);
    const size = getFreedrawStrokeRadius(mouse);

    expect(halfWidthAt(getFreedrawOutlinePoints(mouse), 100)).toBeCloseTo(
      size * (1 - 0.6 * (1 - Math.sin(Math.PI / 4))),
      2,
    );
    expect(halfWidthAt(getFreedrawOutlinePoints(finger), 100)).toBeCloseTo(
      size * Math.max(0.4, 1.1 / size),
      2,
    );
  });

  it("the centerline starts and ends at the recorded ends", () => {
    const { points, pressures } = record(
      (t) => [30 * Math.cos(20 * t), 30 * Math.sin(20 * t)],
      () => 0.2,
      0.5,
      240,
      true,
    );
    const centerline = getFreedrawCenterline(freedraw(points, pressures));
    const [first] = centerline;
    const last = centerline[centerline.length - 1];

    expect(first[0]).toBeCloseTo(points[0][0], 6);
    expect(first[1]).toBeCloseTo(points[0][1], 6);
    expect(last[0]).toBeCloseTo(points[points.length - 1][0], 6);
    expect(last[1]).toBeCloseTo(points[points.length - 1][1], 6);
  });

  // the smoothing does not cross a sharp corner: an "N" keeps its apexes
  it("a sharp corner keeps its apex", () => {
    const corners = [
      [20, 110],
      [60, 20],
      [100, 110],
    ];
    const { points, pressures, origin } = record(
      (t) => {
        const segment = Math.min(1, Math.floor(t / 0.3));
        const u = Math.min(1, (t - segment * 0.3) / 0.3);
        const eased = (1 - Math.cos(Math.PI * u)) / 2; // slows into the corner
        const [ax, ay] = corners[segment];
        const [bx, by] = corners[segment + 1];
        return [ax + (bx - ax) * eased, ay + (by - ay) * eased];
      },
      () => 0.2,
      0.6,
      240,
      true,
    );
    const centerline = getFreedrawCenterline(freedraw(points, pressures));
    const apexDistance = Math.min(
      ...centerline.map(([x, y]) =>
        Math.hypot(x + origin[0] - 60, y + origin[1] - 20),
      ),
    );

    expect(apexDistance).toBeLessThan(1.5);
  });

  // the curve between sparse samples bulges past the extreme samples: here
  // every 30 degrees of a circle, none on its top, bottom, left or right
  it("the ink stays inside the bounds of the recorded points", () => {
    const R = 60;
    const points: LocalPoint[] = [];
    for (let deg = 15; deg <= 15 + 360; deg += 30) {
      const a = (deg * Math.PI) / 180;
      points.push([R * Math.cos(a), R * Math.sin(a)] as LocalPoint);
    }
    const element = freedraw(
      points,
      points.map(() => 0.25),
    );
    const pad = getFreedrawStrokeRadius(element) + 1e-6;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const outline = getFreedrawOutlinePoints(element);
    for (const [x, y] of outline) {
      expect(x).toBeGreaterThanOrEqual(Math.min(...xs) - pad);
      expect(x).toBeLessThanOrEqual(Math.max(...xs) + pad);
      expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - pad);
      expect(y).toBeLessThanOrEqual(Math.max(...ys) + pad);
    }
    // and the loop is still round: the ink reaches out to the bounds
    expect(Math.max(...outline.map(([, y]) => y))).toBeGreaterThan(
      Math.max(...ys) + pad - 1,
    );
  });

  it("degenerate strokes give a finite outline", () => {
    const cases: Array<[LocalPoint[], number[]]> = [
      [[[0, 0]] as LocalPoint[], [0.3]],
      // a tap: the editor moves the pointerup point by 0.0001
      [
        [
          [0, 0],
          [0.0001, 0.0001],
        ] as LocalPoint[],
        [0.3, 0],
      ],
      [
        [
          [0, 0],
          [0, 0],
          [0, 0],
        ] as LocalPoint[],
        [0.3, 0.3, 0],
      ],
      // shorter than a step
      [
        [
          [0, 0],
          [0.3, 0],
          [0.6, 0.1],
        ] as LocalPoint[],
        [0.2, 0.2, 0],
      ],
      // two corners close together, fewer pressures than points
      [
        [
          [0, 0],
          [10, 0],
          [10, 3],
          [0, 3],
          [0, 6],
          [10, 6],
        ] as LocalPoint[],
        [0.2, 0.3],
      ],
      // a long fast flick between two samples
      [
        [
          [0, 0],
          [400, 30],
          [420, 30],
        ] as LocalPoint[],
        [0.2, 0.2, 0],
      ],
    ];
    for (const [points, pressures] of cases) {
      const element = freedraw(points, pressures);
      const outline = getFreedrawOutlinePoints(element);
      expect(outline.length).toBeGreaterThan(0);
      for (const point of [...outline, ...getFreedrawCenterline(element)]) {
        expect(point.every((value) => Number.isFinite(value))).toBe(true);
      }
    }
  });
});
