// -----------------------------------------------------------------------------
// sdamex #5706: pen ink v2
// -----------------------------------------------------------------------------
//
// The second pen ink algorithm (`setFreedrawPenInk("v2")` in shape.ts; the
// host turns it on with the `penInk` prop). The element keeps the recorded
// points as they are; the ink is built along a smoothed, dense copy of them.
//
// 1. Repair (drawing only, the points are not changed). Safari on iPadOS
//    re-delivers coalesced samples of the previous pointermove (WebKit
//    #316105): the recorded path jumps back to a point it already had and
//    replays the block up to where it was. Such a detour is skipped.
// 2. A sample closer than a step to the previous kept one is dropped: Safari
//    before 26.2 rounds Apple Pencil coordinates to whole pixels, and slow
//    handwriting came as a staircase.
// 3. Corners: a turn of 60 degrees or more over a few px splits the stroke
//    into sections; the smoothing does not cross a corner.
// 4. A centripetal Catmull-Rom curve through the kept samples of a section,
//    smoothed along the arc by a symmetric bell (no lag behind the pen; the
//    window shrinks to nothing at the section ends, so the ink starts and ends
//    at the recorded ends without a straight tail).
// 5. Output samples every `outStep` px counted from the section start: the
//    finished part of a stroke does not move while the pen goes on, so it can
//    be drawn once (FreedrawLiveInk) and only the last ~20-40 px are rebuilt
//    on each frame.
// 6. The outline is built here without trigonometry per point (round joins
//    and caps only), and goes to the canvas as a Path2D directly; the SVG
//    path string is built only for SVG export, without a regular expression.
//
// Steps 2-4 are the algorithm of 0.30.10 (`getFreedrawCenterline`); 0.30.10
// spread the output samples over the whole section, so every frame moved all
// of them, and it rebuilt the whole outline with LaserPointer on every frame.

import type { LocalPoint } from "@excalidraw/math";

import type { ExcalidrawFreeDrawElement } from "./types";

export type FreedrawSample = [x: number, y: number, width: number];

/** Same as `getFreedrawStrokeRadius` (shape.ts imports this module). */
const getInkSize = (element: Pick<ExcalidrawFreeDrawElement, "strokeWidth">) =>
  (element.strokeWidth * 4.25) / 2;

/** Smallest ink radius, scene px. */
const FREEDRAW_MIN_RADIUS = 0.5;
/** Smallest radius of the start of a stroke (0.30.10 kept it from 0.30.9). */
const FREEDRAW_START_MIN_RADIUS = 1.1;

// -----------------------------------------------------------------------------
// widths
// -----------------------------------------------------------------------------

/** Width factor of a pen stroke at zero pressure. */
const PEN_MIN_WIDTH = 0.3;
/**
 * Pen pressure of the full width. Safari reports the Apple Pencil force
 * divided by its maximum (about 4.17): an average hand writes at about 0.25.
 */
const PEN_FULL_PRESSURE = 0.6;
/** Width factor of a stroke without pressure (the mouse). */
const MEDIUM_PRESSURE_WIDTH = 1 - 0.6 * (1 - Math.sin(Math.PI / 4));

/**
 * Ink width (a factor of the stroke radius) for a pen pressure: 0.3 at zero
 * pressure, the full width from 0.6, easeOutSine between (#5706, 0.30.10).
 */
export const getFreedrawPenWidth = (pressure: number) =>
  PEN_MIN_WIDTH +
  (1 - PEN_MIN_WIDTH) *
    Math.sin(
      (Math.min(1, Math.max(0, pressure) / PEN_FULL_PRESSURE) * Math.PI) / 2,
    );

/** Pressures of the first samples the start of a pen stroke is blended to. */
const SOFT_START_POINTS = 5;
const SOFT_START_REFERENCE_POINTS = 8;

/**
 * Width factors of the points of a stroke, as in 0.30.10: one number for a
 * stroke of even width (the mouse, a collaborator preview without pressures,
 * a finger without force), else one per point. A pen reports pointerup (and
 * sometimes pointerdown) with pressure 0: such a point takes the nearest real
 * pressure. The first samples lean to the pressure the stroke settles at.
 */
const getFreedrawWidths = (
  element: Pick<
    ExcalidrawFreeDrawElement,
    "points" | "pressures" | "simulatePressure"
  >,
  size: number,
  count = element.points.length,
): number[] | number => {
  const { pressures } = element;
  if (element.simulatePressure || !pressures.length) {
    return MEDIUM_PRESSURE_WIDTH;
  }
  const lastPressure = pressures[pressures.length - 1];
  const known = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    known[i] = pressures[i] ?? lastPressure;
  }
  const firstPressed = known.findIndex((pressure) => pressure > 0);
  if (firstPressed < 0) {
    return Math.max(1 - 0.6, FREEDRAW_START_MIN_RADIUS / size);
  }
  for (let i = 0; i < firstPressed; i++) {
    known[i] = known[firstPressed];
  }
  for (let i = 1; i < count; i++) {
    if (known[i] <= 0) {
      known[i] = known[i - 1];
    }
  }
  const reference = known.slice(1, 1 + SOFT_START_REFERENCE_POINTS);
  const settled = reference.length
    ? reference.reduce((sum, pressure) => sum + pressure, 0) / reference.length
    : known[0];
  return known.map((pressure, i) => {
    const blend = i < SOFT_START_POINTS ? i / SOFT_START_POINTS : 1;
    return getFreedrawPenWidth(settled * (1 - blend) + pressure * blend);
  });
};

/**
 * `getFreedrawWidths` of a pen stroke whose points are only appended, with
 * one pressure per point: each new point costs O(1).
 */
class PenWidthTracker {
  private known: number[] = [];
  firstPressed = -1;

  extend(pressures: readonly number[], count: number) {
    for (let i = this.known.length; i < count; i++) {
      let pressure = pressures[i];
      if (this.firstPressed < 0) {
        if (pressure > 0) {
          this.firstPressed = i;
          for (let j = 0; j < i; j++) {
            this.known[j] = pressure;
          }
        }
      } else if (pressure <= 0) {
        pressure = this.known[i - 1];
      }
      this.known.push(pressure);
    }
  }

  widthAt(i: number, size: number) {
    if (this.firstPressed < 0) {
      return Math.max(1 - 0.6, FREEDRAW_START_MIN_RADIUS / size);
    }
    const { known } = this;
    if (i >= SOFT_START_POINTS) {
      return getFreedrawPenWidth(known[i]);
    }
    const end = Math.min(known.length, 1 + SOFT_START_REFERENCE_POINTS);
    let settled = known[0];
    if (end > 1) {
      settled = 0;
      for (let j = 1; j < end; j++) {
        settled += known[j];
      }
      settled /= end - 1;
    }
    const blend = i / SOFT_START_POINTS;
    return getFreedrawPenWidth(settled * (1 - blend) + known[i] * blend);
  }
}

// -----------------------------------------------------------------------------
// repair of re-delivered samples
// -----------------------------------------------------------------------------

/** How far back (recorded points) a re-delivered block may start. */
const REPAIR_WINDOW = 256;
/** New samples a replayed block may carry besides the repeated ones. */
const REPAIR_SLACK = 8;

/**
 * Indices of the points to draw, or null when nothing is skipped.
 *
 * A detour is skipped when the path jumps back to a point equal to one of the
 * last REPAIR_WINDOW drawn points and then replays the whole block from there
 * to the point before the jump, in order: every point of the block again,
 * with at most REPAIR_SLACK other points among them (a sample the previous
 * pointermove held back, as in the WebKit report). The replay is dropped and
 * the line goes on from the point before the jump. The dropped points repeat
 * drawn ones exactly, so a stroke that really goes over itself loses nothing
 * visible; a path crossing an old one at a pixel does not replay the block.
 */
export const getFreedrawRepairedIndices = (
  points: readonly LocalPoint[],
): number[] | null => {
  const count = points.length;
  if (count < 4) {
    return null;
  }
  // key -> the latest and the one before the latest position in `kept`
  const latest = new Map<number, number>();
  const previous = new Map<number, number>();
  const key = (x: number, y: number) => x * 1048576.5 + y;
  const kept: number[] = [];
  let skipped = false;
  const remember = (index: number) => {
    const k = key(points[index][0], points[index][1]);
    const last = latest.get(k);
    if (last !== undefined) {
      previous.set(k, last);
    }
    latest.set(k, kept.length);
    kept.push(index);
  };
  const same = (a: number, b: number) =>
    points[a][0] === points[b][0] && points[a][1] === points[b][1];

  let i = 0;
  while (i < count) {
    if (kept.length >= 2 && i + 1 < count) {
      const last = kept.length - 1;
      const k = key(points[i][0], points[i][1]);
      let at = latest.get(k);
      if (at === last) {
        at = previous.get(k);
      }
      if (
        at !== undefined &&
        at <= last - 1 &&
        last - at < REPAIR_WINDOW &&
        same(i, kept[at])
      ) {
        // walk the replay: the block kept[at..last] in order
        let next = at + 1;
        let t = i + 1;
        let others = 0;
        while (t < count && next <= last && others <= REPAIR_SLACK) {
          if (same(t, kept[next])) {
            next++;
          } else {
            others++;
          }
          t++;
        }
        if (next > last && others <= REPAIR_SLACK) {
          skipped = true;
          i = t;
          continue;
        }
      }
    }
    remember(i);
    i++;
  }
  return skipped ? kept : null;
};

// -----------------------------------------------------------------------------
// centerline
// -----------------------------------------------------------------------------

type CenterlineParams = {
  /** Kept samples are at least this far apart. */
  step: number;
  /** Half width of the smoothing bell. */
  reach: number;
  /** Distance between output samples. */
  outStep: number;
  /** Distance back and ahead a corner turn is measured over. */
  cornerReach: number;
};

/** Scene px, tied to the ink radius: the ink covers that much smoothing. */
const getCenterlineParams = (size: number): CenterlineParams => ({
  step: Math.min(2.5, Math.max(1, size * 0.6)),
  reach: Math.min(16, Math.max(5, size * 4)),
  outStep: Math.min(4, Math.max(1.5, size * 0.9)),
  cornerReach: Math.min(10, Math.max(4, size * 2)),
});

/** A turn sharper than this over `cornerReach` px on both sides is a corner. */
const CORNER_TURN = (60 * Math.PI) / 180;

/** Biweight kernel: a smooth bell on [-1, 1] without Math.exp. */
const biweight = (u: number) => {
  const v = 1 - u * u;
  return v > 0 ? v * v : 0;
};

/**
 * Output samples of one centerline, built kept sample by kept sample. Every
 * output is final once the samples it depends on are known, so a stroke that
 * is still being drawn reuses everything up to ~2 corner reaches plus one
 * smoothing reach behind the pen. `mark`/`reset` compute the unfinished end
 * without changing the state: everything is appended to arrays and cut back.
 */
class CenterlineStream {
  // kept samples and the arc length along them
  kx: number[] = [];
  ky: number[] = [];
  kw: number[] = [];
  ka: number[] = [];
  /** Turn at each kept sample (0 near the ends), computed in order. */
  private turns: number[] = [];
  private back = 0;
  private ahead = 0;
  /** Kept samples [0, decided) are known to be corners or not. */
  private decided = 0;
  private sectionStart = 0;
  // dense curve of all sections; arc lengths from the start of their section
  private dx: number[] = [];
  private dy: number[] = [];
  private dw: number[] = [];
  private da: number[] = [];
  private denseStart = 0;
  private from = 0;
  private outK = 0;
  // output samples
  ox: number[] = [];
  oy: number[] = [];
  ow: number[] = [];

  constructor(private params: CenterlineParams) {}

  pushKept(x: number, y: number, width: number) {
    const count = this.kx.length;
    this.ka.push(
      count
        ? this.ka[count - 1] +
            Math.hypot(x - this.kx[count - 1], y - this.ky[count - 1])
        : 0,
    );
    this.kx.push(x);
    this.ky.push(y);
    this.kw.push(width);
    if (!count) {
      this.pushDense(x, y, width, 0);
    }
    this.advance(false);
  }

  /** Outputs to the end of the stroke; the kept samples are all pushed. */
  finish() {
    if (this.kx.length < 3) {
      // too short to smooth: the kept samples themselves (as 0.30.10)
      for (let i = 0; i < this.kx.length; i++) {
        this.ox.push(this.kx[i]);
        this.oy.push(this.ky[i]);
        this.ow.push(this.kw[i]);
      }
      return;
    }
    this.advance(true);
  }

  mark() {
    return [
      this.kx.length,
      this.turns.length,
      this.back,
      this.ahead,
      this.decided,
      this.sectionStart,
      this.dx.length,
      this.denseStart,
      this.from,
      this.outK,
      this.ox.length,
    ] as const;
  }

  reset(mark: ReturnType<CenterlineStream["mark"]>) {
    const [kept, turns, back, ahead, decided, sectionStart, dense] = mark;
    this.kx.length = this.ky.length = this.kw.length = this.ka.length = kept;
    this.turns.length = turns;
    this.back = back;
    this.ahead = ahead;
    this.decided = decided;
    this.sectionStart = sectionStart;
    this.dx.length = this.dy.length = this.dw.length = this.da.length = dense;
    this.denseStart = mark[7];
    this.from = mark[8];
    this.outK = mark[9];
    this.ox.length = this.oy.length = this.ow.length = mark[10];
  }

  private pushDense(x: number, y: number, width: number, arc: number) {
    this.dx.push(x);
    this.dy.push(y);
    this.dw.push(width);
    this.da.push(arc);
  }

  private advance(atEnd: boolean) {
    const { kx, ky, ka, turns } = this;
    const { cornerReach } = this.params;
    const count = kx.length;

    // turns, as `findCorners` of 0.30.10
    while (turns.length < count) {
      const i = turns.length;
      while (this.back + 1 < i && ka[i] - ka[this.back + 1] >= cornerReach) {
        this.back++;
      }
      this.ahead = Math.max(this.ahead, i);
      while (this.ahead < count && ka[this.ahead] - ka[i] < cornerReach) {
        this.ahead++;
      }
      const shortBack = ka[i] - ka[this.back] < cornerReach;
      if (!shortBack && this.ahead >= count && !atEnd) {
        break;
      }
      if (shortBack || this.ahead >= count) {
        turns.push(0);
      } else {
        const back = this.back;
        const ahead = this.ahead;
        const ax = kx[i] - kx[back];
        const ay = ky[i] - ky[back];
        const bx = kx[ahead] - kx[i];
        const by = ky[ahead] - ky[i];
        turns.push(Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)));
      }
    }

    // corners: the sharpest turn of a stretch turning by CORNER_TURN or more
    while (this.decided < count) {
      const i = this.decided;
      if (
        !atEnd &&
        !(turns.length && ka[turns.length - 1] - ka[i] > cornerReach)
      ) {
        break;
      }
      let isCorner = turns[i] >= CORNER_TURN;
      for (
        let j = i - 1;
        isCorner && j >= 0 && ka[i] - ka[j] <= cornerReach;
        j--
      ) {
        isCorner = turns[j] < turns[i];
      }
      for (
        let j = i + 1;
        isCorner && j < count && ka[j] - ka[i] <= cornerReach;
        j++
      ) {
        isCorner = turns[j] <= turns[i];
      }
      this.decided++;
      if (i > 0) {
        const isEnd = isCorner || (atEnd && i === count - 1);
        this.pushSegment(i - 1, isEnd);
        if (isEnd) {
          this.emit(true);
          if (i < count - 1) {
            // a new section starts at the corner, which is already an output
            this.denseStart = this.dx.length;
            this.from = this.denseStart;
            this.pushDense(kx[i], ky[i], this.kw[i], 0);
            this.sectionStart = i;
            this.outK = 1;
          }
          continue;
        }
      }
    }
    this.emit(false);
  }

  /**
   * A point one segment back from the end `a` of a section (b, c follow it),
   * along the tangent of the parabola through a, b, c parametrized by chord
   * length. A straight continuation without c, or when the tangent turns away
   * from b (0.30.10).
   */
  private extrapolate(a: number, b: number, c: number) {
    const { kx, ky } = this;
    const h1 = Math.hypot(kx[b] - kx[a], ky[b] - ky[a]);
    let x = 2 * kx[a] - kx[b];
    let y = 2 * ky[a] - ky[b];
    if (c >= 0) {
      const h2 = Math.hypot(kx[c] - kx[b], ky[c] - ky[b]);
      const total = h1 + h2;
      const ka = -(h1 + total) / (h1 * total);
      const kb = total / (h1 * h2);
      const kc = -h1 / (total * h2);
      const tx = ka * kx[a] + kb * kx[b] + kc * kx[c];
      const ty = ka * ky[a] + kb * ky[b] + kc * ky[c];
      const length = Math.hypot(tx, ty);
      if (
        Number.isFinite(length) &&
        length !== 0 &&
        tx * (kx[b] - kx[a]) + ty * (ky[b] - ky[a]) > 0
      ) {
        x = kx[a] - (tx / length) * h1;
        y = ky[a] - (ty / length) * h1;
      }
    }
    return [x, y] as const;
  }

  /**
   * Appends the centripetal Catmull-Rom segment between kept samples a and
   * a + 1 (without the first one) to the dense curve; `isEnd`: a + 1 ends the
   * section.
   */
  private pushSegment(a: number, isEnd: boolean) {
    const { kx, ky, kw } = this;
    const b = a + 1;
    const start = this.sectionStart;
    const p1x = kx[a];
    const p1y = ky[a];
    const p2x = kx[b];
    const p2y = ky[b];
    const length = Math.hypot(p2x - p1x, p2y - p1y);
    const pieces = Math.min(256, Math.ceil(length / this.params.step));
    const da = this.da;
    let arc = da[da.length - 1];
    if (pieces <= 1) {
      arc += Math.hypot(
        p2x - this.dx[this.dx.length - 1],
        p2y - this.dy[this.dy.length - 1],
      );
      this.pushDense(p2x, p2y, kw[b], arc);
      return;
    }
    const [p0x, p0y] =
      a - 1 >= start
        ? [kx[a - 1], ky[a - 1]]
        : this.extrapolate(a, b, isEnd ? -1 : b + 1);
    const [p3x, p3y] = isEnd
      ? this.extrapolate(b, a, a - 1 >= start ? a - 1 : -1)
      : [kx[b + 1], ky[b + 1]];
    const d1 = Math.sqrt(length);
    const d0 = Math.sqrt(Math.hypot(p1x - p0x, p1y - p0y)) || d1;
    const d2 = Math.sqrt(Math.hypot(p3x - p2x, p3y - p2y)) || d1;
    const mx1 =
      ((p1x - p0x) / d0 - (p2x - p0x) / (d0 + d1) + (p2x - p1x) / d1) * d1;
    const mx2 =
      ((p2x - p1x) / d1 - (p3x - p1x) / (d1 + d2) + (p3x - p2x) / d2) * d1;
    const my1 =
      ((p1y - p0y) / d0 - (p2y - p0y) / (d0 + d1) + (p2y - p1y) / d1) * d1;
    const my2 =
      ((p2y - p1y) / d1 - (p3y - p1y) / (d1 + d2) + (p3y - p2y) / d2) * d1;
    const w1 = kw[a];
    const w2 = kw[b];
    let px = this.dx[this.dx.length - 1];
    let py = this.dy[this.dy.length - 1];
    for (let k = 1; k <= pieces; k++) {
      const u = k / pieces;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      const x = h00 * p1x + h10 * mx1 + h01 * p2x + h11 * mx2;
      const y = h00 * p1y + h10 * my1 + h01 * p2y + h11 * my2;
      arc += Math.hypot(x - px, y - py);
      this.pushDense(x, y, w1 + (w2 - w1) * u, arc);
      px = x;
      py = y;
    }
  }

  /**
   * Outputs of the current section every `outStep` px from its start that
   * are final; `closed`: the dense curve reaches the end of the section, so
   * the rest of it and its end go out too.
   */
  private emit(closed: boolean) {
    const { dx, da } = this;
    const { reach, outStep } = this.params;
    const first = this.denseStart;
    const last = dx.length - 1;
    if (last < first) {
      return;
    }
    const total = da[last];
    for (;;) {
      const at = this.outK * outStep;
      if (closed) {
        if (this.outK > 0 && at > total - outStep / 2) {
          break;
        }
      } else if (!(total > at + reach)) {
        break;
      }
      this.emitAt(at, closed ? total : Infinity, this.outK === 0 ? 0 : 1);
      this.outK++;
    }
    if (closed) {
      this.emitAt(total, total, 2);
    }
  }

  /** kind: 0 the start of the stroke, 1 inside, 2 the end of the section. */
  private emitAt(at: number, total: number, kind: 0 | 1 | 2) {
    const { dx, dy, dw, da } = this;
    const { reach } = this.params;
    const first = this.denseStart;
    const end = dx.length;
    // positions: a symmetric window that shrinks to nothing at the ends
    const positionReach = Math.min(reach, at, total - at);
    while (this.from < end - 1 && da[this.from] < at - reach) {
      this.from++;
    }
    let x = 0;
    let y = 0;
    let positionWeights = 0;
    let width = 0;
    let widthWeights = 0;
    for (let j = this.from; j < end && da[j] <= at + reach; j++) {
      const distance = da[j] - at;
      const widthWeight = biweight(distance / reach);
      width += dw[j] * widthWeight;
      widthWeights += widthWeight;
      const weight = positionReach > 0 ? biweight(distance / positionReach) : 0;
      if (weight > 0) {
        x += dx[j] * weight;
        y += dy[j] * weight;
        positionWeights += weight;
      }
    }
    width = widthWeights > 0 ? width / widthWeights : dw[first];
    if (kind === 0) {
      this.pushOut(dx[first], dy[first], width);
    } else if (kind === 2) {
      this.pushOut(dx[end - 1], dy[end - 1], width);
    } else if (positionWeights > 0) {
      this.pushOut(x / positionWeights, y / positionWeights, width);
    } else {
      // window narrower than the dense spacing: the curve point itself
      let j = this.from;
      while (j < end - 2 && da[j + 1] < at) {
        j++;
      }
      const span = da[j + 1] - da[j] || 1;
      const t = Math.min(1, Math.max(0, (at - da[j]) / span));
      this.pushOut(
        dx[j] + (dx[j + 1] - dx[j]) * t,
        dy[j] + (dy[j + 1] - dy[j]) * t,
        width,
      );
    }
  }

  private pushOut(x: number, y: number, width: number) {
    this.ox.push(x);
    this.oy.push(y);
    this.ow.push(width);
  }
}

/**
 * Drops samples closer than a step to the previous kept one. The last kept
 * sample stays pending: the end of the stroke may replace it (0.30.10 kept
 * the pointerup point as the end and dropped the sample it replaced).
 */
class KeptFilter {
  private x = 0;
  private y = 0;
  private w = 0;
  private count = 0;

  constructor(private stream: CenterlineStream, private step: number) {}

  add(x: number, y: number, w: number) {
    if (this.count && Math.hypot(x - this.x, y - this.y) < this.step) {
      return;
    }
    if (this.count) {
      this.stream.pushKept(this.x, this.y, this.w);
    }
    this.x = x;
    this.y = y;
    this.w = w;
    this.count++;
  }

  /** Pushes the pending sample and the end of the stroke at (x, y). */
  pushEnd(x: number, y: number, w: number) {
    const { stream } = this;
    if (!this.count) {
      stream.pushKept(x, y, w);
      return;
    }
    const distance = Math.hypot(x - this.x, y - this.y);
    if (distance >= this.step) {
      stream.pushKept(this.x, this.y, this.w);
      stream.pushKept(x, y, w);
    } else if (distance > 0 && this.count > 1) {
      stream.pushKept(x, y, this.w);
    } else if (distance > 0) {
      stream.pushKept(this.x, this.y, this.w);
      stream.pushKept(x, y, w);
    } else {
      stream.pushKept(this.x, this.y, this.w);
    }
  }
}

type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

const extendBounds = (
  bounds: Bounds,
  points: readonly LocalPoint[],
  from: number,
  to: number,
) => {
  for (let i = from; i < to; i++) {
    const [x, y] = points[i];
    if (x < bounds[0]) {
      bounds[0] = x;
    }
    if (y < bounds[1]) {
      bounds[1] = y;
    }
    if (x > bounds[2]) {
      bounds[2] = x;
    }
    if (y > bounds[3]) {
      bounds[3] = y;
    }
  }
};

/**
 * Between sparse samples the curve can bulge past the extreme recorded point.
 * Bounds, hit areas and the element canvas are sized from the recorded points
 * plus the full ink radius, so the line may go past the box of the points
 * only by what its width leaves of the radius (0.30.10).
 */
const clampToBounds = (
  x: number,
  y: number,
  width: number,
  size: number,
  bounds: Bounds,
) => {
  const radius = Math.max(width * size, FREEDRAW_MIN_RADIUS);
  const slack = Math.max(0, size - radius);
  return [
    Math.min(bounds[2] + slack, Math.max(bounds[0] - slack, x)),
    Math.min(bounds[3] + slack, Math.max(bounds[1] - slack, y)),
  ] as const;
};

type Centerline = {
  xs: number[];
  ys: number[];
  ws: number[];
};

const computeCenterline = (element: ExcalidrawFreeDrawElement): Centerline => {
  const { points } = element;
  const count = points.length;
  if (!count) {
    return { xs: [], ys: [], ws: [] };
  }
  const size = getInkSize(element);
  const widths = getFreedrawWidths(element, size);
  const widthAt = (i: number) =>
    typeof widths === "number" ? widths : widths[i];
  const params = getCenterlineParams(size);
  const stream = new CenterlineStream(params);
  const filter = new KeptFilter(stream, params.step);
  const indices = getFreedrawRepairedIndices(points);
  const total = indices ? indices.length : count;
  for (let k = 0; k < total - 1; k++) {
    const i = indices ? indices[k] : k;
    filter.add(points[i][0], points[i][1], widthAt(i));
  }
  const last = indices ? indices[total - 1] : count - 1;
  filter.pushEnd(points[last][0], points[last][1], widthAt(last));
  stream.finish();

  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  extendBounds(bounds, points, 0, count);
  const xs = stream.ox;
  const ys = stream.oy;
  const ws = stream.ow;
  for (let i = 0; i < xs.length; i++) {
    const [x, y] = clampToBounds(xs[i], ys[i], ws[i], size, bounds);
    xs[i] = x;
    ys[i] = y;
  }
  return { xs, ys, ws };
};

/**
 * The line the ink of a solid pen stroke is drawn along in pen ink v2:
 * [x, y, width factor] in element coordinates, smoothed, without replayed
 * blocks. Starts and ends at the recorded ends of the stroke.
 */
export const getFreedrawCenterline = (
  element: ExcalidrawFreeDrawElement,
): FreedrawSample[] => {
  const { xs, ys, ws } = computeCenterline(element);
  return xs.map((x, i) => [x, ys[i], ws[i]]);
};

// -----------------------------------------------------------------------------
// outline
// -----------------------------------------------------------------------------

const CAP_STEPS = 8;
const CAP_COS: number[] = [];
const CAP_SIN: number[] = [];
for (let k = 0; k <= CAP_STEPS; k++) {
  CAP_COS.push(Math.cos((k * Math.PI) / CAP_STEPS));
  CAP_SIN.push(Math.sin((k * Math.PI) / CAP_STEPS));
}
/** A turn sharper than this at one sample gets a round join outside. */
const JOIN_COS = Math.cos((40 * Math.PI) / 180);
const JOIN_STEP = Math.PI / CAP_STEPS;

const radiusAt = (width: number, size: number, isStrokeStart: boolean) =>
  Math.max(
    width * size,
    isStrokeStart ? FREEDRAW_START_MIN_RADIUS : FREEDRAW_MIN_RADIUS,
  );

/** Unit direction from sample i to i + 1, or null for a zero step. */
const direction = (xs: ArrayLike<number>, ys: ArrayLike<number>, i: number) => {
  const dx = xs[i + 1] - xs[i];
  const dy = ys[i + 1] - ys[i];
  const length = Math.sqrt(dx * dx + dy * dy);
  return length > 1e-9 ? ([dx / length, dy / length] as const) : null;
};

/** Points of an arc of radius r around (cx, cy) from unit u to unit v. */
const pushArc = (
  out: number[],
  cx: number,
  cy: number,
  r: number,
  ux: number,
  uy: number,
  vx: number,
  vy: number,
  reverse: boolean,
) => {
  const angle = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const steps = Math.max(1, Math.ceil(Math.abs(angle) / JOIN_STEP));
  for (let k = 0; k <= steps; k++) {
    const t = ((reverse ? steps - k : k) / steps) * angle;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    out.push(cx + (ux * cos - uy * sin) * r, cy + (ux * sin + uy * cos) * r);
  }
};

/**
 * Appends the closed outline of centerline samples [a, b] (`rs`: radii) to
 * `out` as flat x, y pairs. Samples outside [a, b] set the directions at the
 * ends, so pieces of one centerline overlap seamlessly: each piece ends with a
 * round cap. Without trigonometry per sample: the side points lie along the
 * bisector of the normals; a sharp turn gets a round join on its outer side.
 */
const pushOutline = (
  out: number[],
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  rs: ArrayLike<number>,
  count: number,
  a: number,
  b: number,
) => {
  if (b < a) {
    return;
  }
  if (a === b && (a === 0 || a === count - 1) && count === 1) {
    const r = rs[a];
    for (let k = 0; k < 2 * CAP_STEPS; k++) {
      const c = k < CAP_STEPS ? CAP_COS[k] : -CAP_COS[k - CAP_STEPS];
      const s = k < CAP_STEPS ? CAP_SIN[k] : -CAP_SIN[k - CAP_STEPS];
      out.push(xs[a] + c * r, ys[a] + s * r);
    }
    return;
  }
  const span = b - a + 1;
  // per sample: bisector normal, and the outer normals of a round join
  const nx = new Array<number>(span);
  const ny = new Array<number>(span);
  const join = new Array<number>(span).fill(0); // 1 left, -1 right
  const inX = new Array<number>(span);
  const inY = new Array<number>(span);
  const outX = new Array<number>(span);
  const outY = new Array<number>(span);
  let prev = a > 0 ? direction(xs, ys, a - 1) : null;
  let lastX = 1;
  let lastY = 0;
  for (let i = a; i <= b; i++) {
    const next = i < count - 1 ? direction(xs, ys, i) : null;
    const dIn = prev ?? next;
    const dOut = next ?? prev;
    const k = i - a;
    if (!dIn || !dOut) {
      // no direction anywhere yet: keep the last normal
      nx[k] = -lastY;
      ny[k] = lastX;
    } else {
      const ix = -dIn[1];
      const iy = dIn[0];
      const ox = -dOut[1];
      const oy = dOut[0];
      let bx = ix + ox;
      let by = iy + oy;
      const length = Math.sqrt(bx * bx + by * by);
      if (length < 1e-6) {
        bx = ix;
        by = iy;
      } else {
        bx /= length;
        by /= length;
      }
      nx[k] = bx;
      ny[k] = by;
      if (
        prev &&
        next &&
        i > a &&
        i < b &&
        dIn[0] * dOut[0] + dIn[1] * dOut[1] < JOIN_COS
      ) {
        join[k] = dIn[0] * dOut[1] - dIn[1] * dOut[0] > 0 ? -1 : 1;
        inX[k] = ix;
        inY[k] = iy;
        outX[k] = ox;
        outY[k] = oy;
      }
      lastX = dOut[0];
      lastY = dOut[1];
    }
    if (next) {
      prev = next;
    }
  }

  // left side forward
  for (let i = a; i <= b; i++) {
    const k = i - a;
    const r = rs[i];
    if (join[k] === 1) {
      pushArc(out, xs[i], ys[i], r, inX[k], inY[k], outX[k], outY[k], false);
    } else {
      out.push(xs[i] + nx[k] * r, ys[i] + ny[k] * r);
    }
  }
  // front cap at b: left -> front -> right
  {
    const k = b - a;
    const r = rs[b];
    const tx = ny[k];
    const ty = -nx[k];
    for (let s = 1; s < CAP_STEPS; s++) {
      out.push(
        xs[b] + (nx[k] * CAP_COS[s] + tx * CAP_SIN[s]) * r,
        ys[b] + (ny[k] * CAP_COS[s] + ty * CAP_SIN[s]) * r,
      );
    }
  }
  // right side backward
  for (let i = b; i >= a; i--) {
    const k = i - a;
    const r = rs[i];
    if (join[k] === -1) {
      pushArc(out, xs[i], ys[i], r, -inX[k], -inY[k], -outX[k], -outY[k], true);
    } else {
      out.push(xs[i] - nx[k] * r, ys[i] - ny[k] * r);
    }
  }
  // back cap at a: right -> back -> left
  {
    const r = rs[a];
    const tx = ny[0];
    const ty = -nx[0];
    for (let s = 1; s < CAP_STEPS; s++) {
      out.push(
        xs[a] - (nx[0] * CAP_COS[s] + tx * CAP_SIN[s]) * r,
        ys[a] - (ny[0] * CAP_COS[s] + ty * CAP_SIN[s]) * r,
      );
    }
  }
};

/** The minimal Path2D / CanvasPath surface the outline is written to. */
export type FreedrawPathSink = {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
};

/**
 * Writes a closed outline (flat x, y pairs) as the path the SVG of 0.30.9
 * describes: quadratic segments through the midpoints of the sides.
 */
export const writeFreedrawOutlinePath = (
  sink: FreedrawPathSink,
  outline: ArrayLike<number>,
) => {
  const count = outline.length / 2;
  if (!count) {
    return;
  }
  const x0 = outline[0];
  const y0 = outline[1];
  sink.moveTo(x0, y0);
  for (let i = 0; i < count; i++) {
    const x = outline[2 * i];
    const y = outline[2 * i + 1];
    const j = i + 1 < count ? 2 * (i + 1) : 0;
    sink.quadraticCurveTo(x, y, (x + outline[j]) / 2, (y + outline[j + 1]) / 2);
  }
  sink.lineTo(x0, y0);
  sink.closePath();
};

/**
 * Rounded to two decimals, as `${Math.round(value * 100) / 100}` but from
 * integers: converting a fraction to a string was most of the SVG time.
 */
const formatNumber = (value: number) => {
  const hundredths = Math.round(value * 100);
  const abs = hundredths < 0 ? -hundredths : hundredths;
  const whole = Math.floor(abs / 100);
  const fraction = abs - whole * 100;
  const sign = hundredths < 0 ? "-" : "";
  if (fraction === 0) {
    return sign + whole;
  }
  if (fraction % 10 === 0) {
    return `${sign}${whole}.${fraction / 10}`;
  }
  return `${sign}${whole}${fraction < 10 ? ".0" : "."}${fraction}`;
};

/** The same path as an SVG path string, built without a regular expression. */
export const getFreedrawOutlineSvgPath = (outline: ArrayLike<number>) => {
  const count = outline.length / 2;
  if (!count) {
    return "";
  }
  const p0 = `${formatNumber(outline[0])},${formatNumber(outline[1])}`;
  let path = `M ${p0} Q`;
  for (let i = 0; i < count; i++) {
    const x = outline[2 * i];
    const y = outline[2 * i + 1];
    const j = i + 1 < count ? 2 * (i + 1) : 0;
    path += ` ${formatNumber(x)},${formatNumber(y)} ${formatNumber(
      (x + outline[j]) / 2,
    )},${formatNumber((y + outline[j + 1]) / 2)}`;
  }
  return `${path} L ${p0} Z`;
};

// -----------------------------------------------------------------------------
// ink of a finished stroke (cached)
// -----------------------------------------------------------------------------

export type FreedrawInk = {
  /** Closed outline, flat x, y pairs, element coordinates. */
  outline: number[];
  path?: Path2D;
  svgPath?: string;
  outlinePoints?: [number, number][];
};

const computeInk = (element: ExcalidrawFreeDrawElement): FreedrawInk => {
  const { xs, ys, ws } = computeCenterline(element);
  const size = getInkSize(element);
  const rs = ws.map((width, i) => radiusAt(width, size, i === 0));
  const outline: number[] = [];
  pushOutline(outline, xs, ys, rs, xs.length, 0, xs.length - 1);
  return { outline };
};

let inkCache = new WeakMap<
  ExcalidrawFreeDrawElement,
  {
    points: ExcalidrawFreeDrawElement["points"];
    pressures: ExcalidrawFreeDrawElement["pressures"];
    strokeWidth: number;
    simulatePressure: boolean;
    ink: FreedrawInk;
  }
>();

/** The v2 ink of a stroke, computed once per points (ShapeCache drops it). */
export const getFreedrawInk = (
  element: ExcalidrawFreeDrawElement,
): FreedrawInk => {
  const cached = inkCache.get(element);
  if (
    cached &&
    cached.points === element.points &&
    cached.pressures === element.pressures &&
    cached.strokeWidth === element.strokeWidth &&
    cached.simulatePressure === element.simulatePressure
  ) {
    return cached.ink;
  }
  const ink = computeInk(element);
  inkCache.set(element, {
    points: element.points,
    pressures: element.pressures,
    strokeWidth: element.strokeWidth,
    simulatePressure: element.simulatePressure,
    ink,
  });
  return ink;
};

export const deleteFreedrawInk = (element: object) => {
  inkCache.delete(element as ExcalidrawFreeDrawElement);
};

export const clearFreedrawInkCache = () => {
  inkCache = new WeakMap();
};

/** Outline of the v2 ink as [x, y] pairs (the eraser tests against it). */
export const getFreedrawInkOutlinePoints = (
  element: ExcalidrawFreeDrawElement,
): [number, number][] => {
  const ink = getFreedrawInk(element);
  if (!ink.outlinePoints) {
    const points: [number, number][] = [];
    for (let i = 0; i < ink.outline.length; i += 2) {
      points.push([ink.outline[i], ink.outline[i + 1]]);
    }
    ink.outlinePoints = points;
  }
  return ink.outlinePoints;
};

/** Path2D of the v2 ink for the canvas, without an SVG string. */
export const getFreedrawInkPath2D = (element: ExcalidrawFreeDrawElement) => {
  const ink = getFreedrawInk(element);
  if (!ink.path) {
    const path = new Path2D();
    writeFreedrawOutlinePath(path, ink.outline);
    ink.path = path;
  }
  return ink.path;
};

/** SVG path of the v2 ink (SVG export). */
export const getFreedrawInkSvgPath = (element: ExcalidrawFreeDrawElement) => {
  const ink = getFreedrawInk(element);
  if (ink.svgPath === undefined) {
    ink.svgPath = getFreedrawOutlineSvgPath(ink.outline);
  }
  return ink.svgPath;
};

// -----------------------------------------------------------------------------
// ink of a stroke being drawn
// -----------------------------------------------------------------------------

/** Centerline samples per frozen piece of a stroke being drawn. */
export const FREEDRAW_LIVE_CHUNK = 64;

/** Consumed points compared on each update to find points moved in place. */
const CONTINUE_PROBES = 16;

export type FreedrawLiveFrame = {
  /** Outlines of the frozen pieces, oldest first; they never change. */
  chunks: readonly number[][];
  /** The pieces before this index were returned by an earlier frame. */
  firstNewChunk: number;
  /** Outline of the rest of the stroke, rebuilt on every frame. */
  tail: number[];
  /** The stroke was rebuilt from its start: earlier pieces are void. */
  restarted: boolean;
};

/**
 * Ink of a stroke while it is being drawn. The points are only appended, so
 * each frame consumes the new ones: the finished part of the centerline is
 * kept and cut into pieces of FREEDRAW_LIVE_CHUNK samples whose outlines
 * overlap by one sample with round ends; the rest (the last ~20-40 px of the
 * path) is rebuilt. The cost of a frame does not grow with the stroke. The
 * repair of replayed blocks is not applied here: new strokes come through the
 * input filter of v2; the finished stroke is drawn from `getFreedrawInk`.
 */
export class FreedrawLiveInk {
  private stream!: CenterlineStream;
  private filter!: KeptFilter;
  private params!: CenterlineParams;
  private size = 0;
  private simulatePressure = false;
  private fed = 0;
  private seen = 0;
  private lastX = 0;
  private lastY = 0;
  private lastPressure: number | undefined;
  private consumed: readonly LocalPoint[] = [];
  private fingerAssumed = false;
  private widths = new PenWidthTracker();
  private bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  private bounded = 0;
  // frozen centerline samples (clamped when they froze) and their radii
  private fx: number[] = [];
  private fy: number[] = [];
  private fw: number[] = [];
  private fr: number[] = [];
  private chunks: number[][] = [];
  private chunkStart = 0;
  private reported = 0;
  // centerline of the last tail (tests): samples from tailStart on
  private tailX: number[] = [];
  private tailY: number[] = [];
  private tailStart = 0;

  constructor() {
    this.restart(1, false);
  }

  private restart(strokeWidth: number, simulatePressure: boolean) {
    this.size = getInkSize({ strokeWidth });
    this.simulatePressure = simulatePressure;
    this.params = getCenterlineParams(this.size);
    this.stream = new CenterlineStream(this.params);
    this.filter = new KeptFilter(this.stream, this.params.step);
    this.fed = 0;
    this.seen = 0;
    this.fingerAssumed = false;
    this.widths = new PenWidthTracker();
    this.bounds = [Infinity, Infinity, -Infinity, -Infinity];
    this.bounded = 0;
    this.fx = [];
    this.fy = [];
    this.fw = [];
    this.fr = [];
    this.chunks = [];
    this.chunkStart = 0;
    this.reported = 0;
  }

  /** Whether `element` only appended points to what this ink consumed. */
  private continues(element: ExcalidrawFreeDrawElement) {
    const { points, pressures } = element;
    if (
      getInkSize(element) !== this.size ||
      element.simulatePressure !== this.simulatePressure ||
      points.length < this.seen
    ) {
      return false;
    }
    if (!this.seen) {
      return true;
    }
    const last = points[this.seen - 1];
    if (
      last[0] !== this.lastX ||
      last[1] !== this.lastY ||
      pressures[this.seen - 1] !== this.lastPressure
    ) {
      return false;
    }
    // points moved in place: hold-to-straighten animates every point toward
    // the line in new tuples, with the count and both ends unchanged. App
    // appends with a spread, so consumed points keep their tuples; probes
    // compare by tuple, else by value
    const consumed = this.consumed;
    if (consumed !== points) {
      const seen = this.seen;
      const stride = Math.max(1, Math.floor(seen / CONTINUE_PROBES));
      for (let i = 0; i < seen; i += stride) {
        const now = points[i];
        const before = consumed[i];
        if (now !== before && (now[0] !== before[0] || now[1] !== before[1])) {
          return false;
        }
      }
    }
    return true;
  }

  update(element: ExcalidrawFreeDrawElement): FreedrawLiveFrame {
    let restarted = false;
    if (!this.continues(element)) {
      this.restart(element.strokeWidth, element.simulatePressure);
      restarted = true;
    }
    const { points, pressures } = element;
    const count = points.length;
    const size = this.size;
    const even = element.simulatePressure || !pressures.length;
    // widths are final once the soft start is known (9 points) and a pen
    // stroke records a pressure per point. A finger without force (all 0)
    // freezes with its even width and restarts if a pressure shows up
    const incremental =
      even ||
      (pressures.length === count && count > SOFT_START_REFERENCE_POINTS);
    let widthAt: (i: number) => number;
    if (even) {
      widthAt = () => MEDIUM_PRESSURE_WIDTH;
    } else if (incremental) {
      this.widths.extend(pressures, count);
      if (this.fingerAssumed && this.widths.firstPressed >= 0) {
        this.restart(element.strokeWidth, element.simulatePressure);
        this.widths.extend(pressures, count);
        restarted = true;
      }
      const tracker = this.widths;
      widthAt = (i) => tracker.widthAt(i, size);
    } else {
      const widths = getFreedrawWidths(element, size, count);
      widthAt = (i) => (typeof widths === "number" ? widths : widths[i]);
    }

    extendBounds(this.bounds, points, this.bounded, count);
    this.bounded = count;

    if (incremental && count > 1) {
      for (; this.fed < count - 1; this.fed++) {
        const [x, y] = points[this.fed];
        this.filter.add(x, y, widthAt(this.fed));
      }
      if (!even && this.widths.firstPressed < 0) {
        this.fingerAssumed = true;
      }
      this.freeze();
    }
    this.seen = count;
    this.consumed = points;
    if (count) {
      this.lastX = points[count - 1][0];
      this.lastY = points[count - 1][1];
      this.lastPressure = pressures[count - 1];
    }

    // the rest of the stroke, without changing the state
    const tail: number[] = [];
    if (count) {
      let stream = this.stream;
      let filter = this.filter;
      let mark: ReturnType<CenterlineStream["mark"]> | null = null;
      if (this.fed) {
        mark = stream.mark();
      } else {
        stream = new CenterlineStream(this.params);
        filter = new KeptFilter(stream, this.params.step);
        for (let i = 0; i < count - 1; i++) {
          filter.add(points[i][0], points[i][1], widthAt(i));
        }
      }
      const frozen = this.fx.length;
      const [x, y] = points[count - 1];
      filter.pushEnd(x, y, widthAt(count - 1));
      stream.finish();
      const xs: number[] = [];
      const ys: number[] = [];
      const rs: number[] = [];
      // one frozen sample before the tail sets its first direction
      const from = Math.max(0, this.chunkStart - 1);
      for (let i = from; i < frozen; i++) {
        xs.push(this.fx[i]);
        ys.push(this.fy[i]);
        rs.push(this.fr[i]);
      }
      for (let i = frozen; i < stream.ox.length; i++) {
        const [cx, cy] = clampToBounds(
          stream.ox[i],
          stream.oy[i],
          stream.ow[i],
          size,
          this.bounds,
        );
        xs.push(cx);
        ys.push(cy);
        rs.push(radiusAt(stream.ow[i], size, i === 0));
      }
      if (mark) {
        stream.reset(mark);
      }
      this.tailX = xs;
      this.tailY = ys;
      this.tailStart = this.chunkStart - from;
      pushOutline(
        tail,
        xs,
        ys,
        rs,
        xs.length,
        this.chunkStart - from,
        xs.length - 1,
      );
    }

    const firstNewChunk = restarted ? 0 : this.reported;
    this.reported = this.chunks.length;
    return { chunks: this.chunks, firstNewChunk, tail, restarted };
  }

  /** Takes the new final outputs and cuts the full pieces of them. */
  private freeze() {
    const { stream, size } = this;
    for (let i = this.fx.length; i < stream.ox.length; i++) {
      const [x, y] = clampToBounds(
        stream.ox[i],
        stream.oy[i],
        stream.ow[i],
        size,
        this.bounds,
      );
      this.fx.push(x);
      this.fy.push(y);
      this.fw.push(stream.ow[i]);
      this.fr.push(radiusAt(stream.ow[i], size, i === 0));
    }
    // a piece needs the sample after its end for the direction there
    while (this.fx.length - 1 > this.chunkStart + FREEDRAW_LIVE_CHUNK) {
      const outline: number[] = [];
      pushOutline(
        outline,
        this.fx,
        this.fy,
        this.fr,
        this.fx.length,
        this.chunkStart,
        this.chunkStart + FREEDRAW_LIVE_CHUNK,
      );
      this.chunks.push(outline);
      this.chunkStart += FREEDRAW_LIVE_CHUNK;
    }
  }

  /** Frozen centerline samples so far (tests). */
  getFrozenCenterline(): FreedrawSample[] {
    return this.fx.map((x, i) => [x, this.fy[i], this.fw[i]]);
  }

  /** Centerline drawn by the last frame: pieces, then the tail (tests). */
  getFrameCenterline(): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < this.chunkStart; i++) {
      out.push([this.fx[i], this.fy[i]]);
    }
    for (let i = this.tailStart; i < this.tailX.length; i++) {
      out.push([this.tailX[i], this.tailY[i]]);
    }
    return out;
  }
}
