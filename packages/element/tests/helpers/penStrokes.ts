// Synthetic Apple Pencil strokes for the pen ink tests (sdamex #5706): a pen
// going round in loops, sampled the way a browser reports it, delivered frame
// by frame the way the editor receives it.

import type { LocalPoint, Radians } from "@excalidraw/math";

import type { ExcalidrawFreeDrawElement } from "../../src/types";

/** Deterministic PRNG (mulberry32). */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type Pen = (t: number) => [x: number, y: number, pressure: number];

/**
 * A coil of loops: the pen circles with `radius` at `loopsPerSec` while the
 * center drifts along x at `drift` px/s and wobbles in y. Pressure moves in
 * `pressure` (Safari reports the force over its maximum: 0.05..0.3).
 */
export const coil = ({
  radius = 40,
  loopsPerSec = 4,
  drift = 60,
  seed = 1,
  pressure = [0.05, 0.3] as [number, number],
}): Pen => {
  const random = rng(seed);
  const phase = random() * Math.PI * 2;
  const wobble = Array.from({ length: 64 }, () => 0.8 + 0.4 * random());
  const [low, high] = pressure;
  return (t) => {
    const a = 2 * Math.PI * loopsPerSec * t + phase;
    const k = Math.floor(a / (2 * Math.PI));
    const f = a / (2 * Math.PI) - k;
    const rad = radius * (wobble[k & 63] * (1 - f) + wobble[(k + 1) & 63] * f);
    const cx = drift * t;
    const cy = 30 * Math.sin(2 * Math.PI * 0.15 * t);
    const p =
      low + ((high - low) * (1 + Math.sin(2 * Math.PI * 0.7 * t + 1))) / 2;
    return [cx + rad * Math.cos(a), cy + rad * 0.8 * Math.sin(a), p];
  };
};

export type PenSample = { t: number; x: number; y: number; p: number };

/** Samples at `hz`; `wholePixels`: Safari before 26.2 rounds coordinates. */
export const sample = (
  pen: Pen,
  { hz = 240, seconds = 2, wholePixels = true } = {},
): PenSample[] => {
  const out: PenSample[] = [];
  const n = Math.round(hz * seconds);
  for (let i = 0; i <= n; i++) {
    const t = i / hz;
    const [x, y, p] = pen(t);
    out.push({
      t,
      x: wholePixels ? Math.round(x) : x,
      y: wholePixels ? Math.round(y) : y,
      p,
    });
  }
  return out;
};

/** Samples grouped into frames of `frameMs` (a function of the time). */
export const frames = (
  samples: readonly PenSample[],
  frameMs: number | ((t: number) => number),
): PenSample[][] => {
  const frameAt = typeof frameMs === "function" ? frameMs : () => frameMs;
  const out: PenSample[][] = [];
  let current: PenSample[] = [];
  let end = frameAt(0) / 1000;
  for (const s of samples) {
    if (s.t > end && current.length) {
      out.push(current);
      current = [];
      end = s.t + frameAt(s.t) / 1000;
    }
    current.push(s);
  }
  if (current.length) {
    out.push(current);
  }
  return out;
};

/**
 * The samples as 0.30.9 recorded them: every sample once ("clean"), or each
 * frame followed by a replay of its last `overlap` share ("replayed", the
 * WebKit #316105 pattern seen on the iPad video). A sample equal to the
 * previous one is skipped, as the editor does.
 */
export const record = (
  samples: readonly PenSample[],
  {
    mode = "clean" as "clean" | "replayed",
    frameMs = 16.7 as number | ((t: number) => number),
    overlap = 1,
  } = {},
): PenSample[] => {
  const out: PenSample[] = [];
  for (const frame of frames(samples, frameMs)) {
    const k = Math.max(1, Math.round(frame.length * overlap));
    const list =
      mode === "replayed"
        ? [...frame, ...frame.slice(frame.length - k)]
        : frame;
    for (const s of list) {
      const last = out[out.length - 1];
      if (last && last.x === s.x && last.y === s.y) {
        continue;
      }
      out.push(s);
    }
  }
  return out;
};

export const freedrawElement = (
  points: readonly LocalPoint[],
  pressures: readonly number[],
  overrides: Partial<ExcalidrawFreeDrawElement> = {},
): ExcalidrawFreeDrawElement =>
  ({
    id: "fd-pen-v2",
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

/** A stroke of recorded samples, relative to the first one. */
export const toElement = (
  samples: readonly PenSample[],
  overrides: Partial<ExcalidrawFreeDrawElement> = {},
) => {
  const { x: x0, y: y0 } = samples[0];
  return freedrawElement(
    samples.map((s) => [s.x - x0, s.y - y0] as LocalPoint),
    samples.map((s) => s.p),
    { x: x0, y: y0, ...overrides },
  );
};

/**
 * Distance to the true path of a pen (densely sampled, relative to `origin`):
 * a grid of the path points, then the segments around the nearest ones.
 */
export const truePath = (
  pen: Pen,
  seconds: number,
  origin: readonly [number, number],
) => {
  const points: [number, number][] = [];
  for (let k = 0; k <= seconds * 4000; k++) {
    const [x, y] = pen(k / 4000);
    points.push([x - origin[0], y - origin[1]]);
  }
  const cell = 8;
  const grid = new Map<string, number[]>();
  points.forEach(([x, y], i) => {
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    const list = grid.get(key);
    if (list) {
      list.push(i);
    } else {
      grid.set(key, [i]);
    }
  });
  const segment = (i: number, x: number, y: number) => {
    const [ax, ay] = points[i];
    const [bx, by] = points[Math.min(points.length - 1, i + 1)];
    const dx = bx - ax;
    const dy = by - ay;
    const l = dx * dx + dy * dy;
    const t = l
      ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l))
      : 0;
    return Math.hypot(ax + dx * t - x, ay + dy * t - y);
  };
  return (x: number, y: number) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let best = Infinity;
    for (let r = 0; r < 64; r++) {
      for (let i = -r; i <= r; i++) {
        for (let j = -r; j <= r; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r) {
            continue;
          }
          for (const k of grid.get(`${cx + i},${cy + j}`) ?? []) {
            best = Math.min(
              best,
              segment(k, x, y),
              segment(Math.max(0, k - 1), x, y),
            );
          }
        }
      }
      if (best <= (r - 1) * cell) {
        return best;
      }
    }
    return best;
  };
};

/** Largest distance from the points of `a` to the polyline `b`. */
export const distanceToPolyline = (
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
) => {
  let max = 0;
  for (const [x, y] of a) {
    let best = Infinity;
    for (let i = 0; i + 1 < b.length; i++) {
      const [ax, ay] = b[i];
      const [bx, by] = b[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const l = dx * dx + dy * dy;
      const t = l
        ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l))
        : 0;
      best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y));
    }
    if (b.length === 1) {
      best = Math.hypot(b[0][0] - x, b[0][1] - y);
    }
    max = Math.max(max, best);
  }
  return max;
};
