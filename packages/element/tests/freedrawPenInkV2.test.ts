import {
  FREEDRAW_LIVE_CHUNK,
  FreedrawLiveInk,
  getFreedrawCenterline,
  getFreedrawInk,
  getFreedrawRepairedIndices,
  writeFreedrawOutlinePath,
} from "../src/freedrawInk";
import {
  ShapeCache,
  getFreedrawOutlinePoints,
  getFreedrawStrokeRadius,
  setFreedrawPenInk,
} from "../src/shape";

import {
  coil,
  distanceToPolyline,
  record,
  rng,
  sample,
  toElement,
  truePath,
} from "./helpers/penStrokes";

import type { FreedrawPathSink } from "../src/freedrawInk";
import type { ExcalidrawFreeDrawElement } from "../src/types";

// sdamex #5706: pen ink v2. Synthetic Apple Pencil loops (helpers/penStrokes):
// whole-pixel coordinates as Safari before 26.2 reports them, pressures of a
// hand (0.05..0.3), 60 and 240 samples a second.

beforeAll(() => {
  setFreedrawPenInk("v2");
});
afterAll(() => {
  setFreedrawPenInk("legacy");
});

const SECONDS = 2;

const loops = (radius: number, hz: number, seed = radius + hz) => {
  const pen = coil({ radius, loopsPerSec: 4, drift: radius * 2, seed });
  const samples = sample(pen, { hz, seconds: SECONDS });
  return { pen, samples };
};

/** A sink with the cost of one call per path command, like Path2D. */
const countingSink = (): FreedrawPathSink & { commands: number } => {
  const sink = {
    commands: 0,
    moveTo() {
      sink.commands++;
    },
    lineTo() {
      sink.commands++;
    },
    quadraticCurveTo() {
      sink.commands++;
    },
    closePath() {
      sink.commands++;
    },
  };
  return sink;
};

/** The element with new point arrays: no cached ink applies. */
const fresh = (element: ExcalidrawFreeDrawElement) => ({
  ...element,
  points: element.points.slice(),
  pressures: element.pressures.slice(),
});

describe("pen ink v2: shape", () => {
  it.each([
    [20, 240],
    [20, 60],
    [40, 240],
    [40, 60],
    [60, 240],
    [60, 60],
  ])(
    "loops of radius %i at %i Hz: the line is within 1 px of the pen path",
    (radius, hz) => {
      const { pen, samples } = loops(radius, hz);
      const element = toElement(record(samples));
      const distance = truePath(pen, SECONDS, [element.x, element.y]);

      const centerline = getFreedrawCenterline(element);
      let worst = 0;
      for (const [x, y] of centerline) {
        worst = Math.max(worst, distance(x, y));
      }
      expect(worst).toBeLessThanOrEqual(1);

      // and the ink does not leave the path by more than its radius (no
      // chords): every outline point is near a point of the line
      const size = getFreedrawStrokeRadius(element);
      let stray = 0;
      for (const [x, y] of getFreedrawOutlinePoints(element)) {
        stray = Math.max(stray, distance(x, y) - size);
      }
      expect(stray).toBeLessThanOrEqual(1);
    },
  );

  it("output samples are spaced from the start of a section, so the drawn part does not move", () => {
    const { samples } = loops(40, 240);
    const element = toElement(record(samples));
    const full = getFreedrawCenterline(element);
    const prefix = getFreedrawCenterline({
      ...element,
      points: element.points.slice(0, 300),
      pressures: element.pressures.slice(0, 300),
    });
    // all but the last ~40 px of the prefix stay where they are
    expect(prefix.length).toBeGreaterThan(100);
    for (let i = 0; i < prefix.length - 25; i++) {
      expect(
        Math.hypot(prefix[i][0] - full[i][0], prefix[i][1] - full[i][1]),
      ).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe("pen ink v2: repair of replayed blocks", () => {
  it.each([
    [20, 50, 1],
    [40, 133, 1],
    [60, 233, 1],
    [40, 67, 0.5],
  ])(
    "loops of radius %i, frames of %i ms, replayed share %f: within 0.5 px of the clean stroke",
    (radius, frameMs, overlap) => {
      const { samples } = loops(radius, 240, 11);
      const clean = toElement(record(samples));
      const dirty = toElement(
        record(samples, { mode: "replayed", frameMs, overlap }),
      );
      const recorded = dirty.points.length;
      expect(recorded).toBeGreaterThan(clean.points.length);

      const repaired = getFreedrawCenterline(dirty);
      const reference = getFreedrawCenterline(clean);
      expect(distanceToPolyline(repaired, reference)).toBeLessThanOrEqual(0.5);
      expect(distanceToPolyline(reference, repaired)).toBeLessThanOrEqual(0.5);
      // drawing only: the recorded points stay
      expect(dirty.points.length).toBe(recorded);
    },
  );

  it("a clean stroke is never repaired, even when loops cross pixel by pixel", () => {
    let repaired = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (const radius of [10, 20, 40]) {
        for (const drift of [0, 5, 20, 80]) {
          for (const hz of [60, 240]) {
            const pen = coil({
              radius,
              loopsPerSec: 2 + (seed % 4),
              drift,
              seed,
            });
            const element = toElement(record(sample(pen, { hz, seconds: 3 })));
            if (getFreedrawRepairedIndices(element.points)) {
              repaired++;
            }
          }
        }
      }
    }
    expect(repaired).toBe(0);
  });
});

describe("pen ink v2: a stroke being drawn", () => {
  const strokes: [
    string,
    number,
    number,
    Partial<ExcalidrawFreeDrawElement>,
  ][] = [
    ["pen, 240 Hz", 40, 240, {}],
    ["pen, 60 Hz", 60, 60, {}],
    ["highlighter", 40, 240, { strokeWidth: 12 }],
    ["mouse", 30, 60, { simulatePressure: true, pressures: [] }],
  ];
  it.each(strokes)(
    "%s: frames of 16-233 ms, frozen pieces never change, the end matches the full ink",
    (_, radius, hz, overrides) => {
      const pen = coil({ radius, loopsPerSec: 4, drift: radius * 2, seed: 5 });
      const recorded = record(sample(pen, { hz, seconds: 4 }));
      const full = toElement(recorded, overrides);
      const random = rng(9);
      const live = new FreedrawLiveInk();
      const snapshots: string[] = [];
      let count = 1;
      let longestTail = 0;
      while (count < full.points.length) {
        const frameMs = 16 + random() * (233 - 16);
        count = Math.min(
          full.points.length,
          count + Math.max(1, Math.round((frameMs / 1000) * hz)),
        );
        const frame = live.update({
          ...full,
          points: full.points.slice(0, count),
          pressures: full.pressures.slice(0, count),
        });
        if (snapshots.length) {
          expect(frame.restarted).toBe(false);
        }
        for (let i = 0; i < snapshots.length; i++) {
          expect(JSON.stringify(frame.chunks[i])).toBe(snapshots[i]);
        }
        for (let i = snapshots.length; i < frame.chunks.length; i++) {
          snapshots.push(JSON.stringify(frame.chunks[i]));
        }
        longestTail = Math.max(
          longestTail,
          live.getFrameCenterline().length -
            frame.chunks.length * FREEDRAW_LIVE_CHUNK,
        );
      }
      expect(snapshots.length).toBeGreaterThan(5);

      const reference = getFreedrawCenterline(full);
      const frozen = live.getFrozenCenterline();
      expect(frozen.length).toBeGreaterThan(reference.length * 0.8);
      for (let i = 0; i < frozen.length; i++) {
        expect(
          Math.hypot(
            frozen[i][0] - reference[i][0],
            frozen[i][1] - reference[i][1],
          ),
        ).toBeLessThanOrEqual(0.5);
      }
      // the last frame draws the whole stroke as the full pass does
      const drawn = live.getFrameCenterline();
      expect(drawn.length).toBe(reference.length);
      for (let i = 0; i < drawn.length; i++) {
        expect(
          Math.hypot(
            drawn[i][0] - reference[i][0],
            drawn[i][1] - reference[i][1],
          ),
        ).toBeLessThanOrEqual(0.5);
      }
      // a frame rebuilds a short end only
      expect(longestTail).toBeLessThan(FREEDRAW_LIVE_CHUNK + 80);
    },
  );

  it("starts over when the points are replaced (hold-to-straighten)", () => {
    const { samples } = loops(40, 240);
    const element = toElement(record(samples));
    const live = new FreedrawLiveInk();
    live.update(element);
    const straight = {
      ...element,
      points: [element.points[0], element.points[element.points.length - 1]],
      pressures: [1, 1],
    };
    const frame = live.update(straight);
    expect(frame.restarted).toBe(true);
    expect(frame.chunks.length).toBe(0);
    expect(live.getFrameCenterline().length).toBe(2);
  });
});

describe("pen ink v2: cost (relative, stable in CI)", () => {
  // the coordinator's benchmark stroke: radius 60, 4 loops a second, 240 Hz
  const pen = coil({ radius: 60, loopsPerSec: 4, drift: 60, seed: 7 });
  const stroke = toElement(record(sample(pen, { hz: 240, seconds: 18 })));

  it("a frame at 4000 points costs at most 1.5 times a frame at 500", () => {
    const run = () => {
      const live = new FreedrawLiveInk();
      const windows = { small: [0, 0], large: [0, 0] };
      for (let count = 2; count <= 4100; count += 4) {
        const element = {
          ...stroke,
          points: stroke.points.slice(0, count),
          pressures: stroke.pressures.slice(0, count),
        };
        const start = performance.now();
        const frame = live.update(element);
        const sink = countingSink();
        for (let i = frame.firstNewChunk; i < frame.chunks.length; i++) {
          writeFreedrawOutlinePath(sink, frame.chunks[i]);
        }
        writeFreedrawOutlinePath(sink, frame.tail);
        const time = performance.now() - start;
        const window =
          count > 300 && count <= 700
            ? windows.small
            : count > 3700
            ? windows.large
            : null;
        if (window) {
          window[0] += time;
          window[1]++;
        }
      }
      return [
        windows.small[0] / windows.small[1],
        windows.large[0] / windows.large[1],
      ];
    };
    run(); // warm up
    let small = Infinity;
    let large = Infinity;
    for (let i = 0; i < 3; i++) {
      const [s, l] = run();
      small = Math.min(small, s);
      large = Math.min(large, l);
    }
    expect(large).toBeLessThanOrEqual(1.5 * small);
  });

  it("the full ink at 3400 points costs at most 1.2 times the legacy ink", () => {
    const element = {
      ...stroke,
      points: stroke.points.slice(0, 3400),
      pressures: stroke.pressures.slice(0, 3400),
    };
    // legacy: LaserPointer outline and the SVG string the canvas parses
    const legacy = () => {
      setFreedrawPenInk("legacy");
      const start = performance.now();
      ShapeCache.generateElementShape(fresh(element), null);
      const time = performance.now() - start;
      setFreedrawPenInk("v2");
      return time;
    };
    // v2: centerline, outline, and the commands of the canvas path
    const v2 = () => {
      const start = performance.now();
      const ink = getFreedrawInk(fresh(element));
      writeFreedrawOutlinePath(countingSink(), ink.outline);
      return performance.now() - start;
    };
    legacy();
    v2();
    let legacyBest = Infinity;
    let v2Best = Infinity;
    for (let i = 0; i < 7; i++) {
      legacyBest = Math.min(legacyBest, legacy());
      v2Best = Math.min(v2Best, v2());
    }
    expect(v2Best).toBeLessThanOrEqual(1.2 * legacyBest);
  });
});
