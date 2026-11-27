import { pointFrom, pointDistance } from "@excalidraw/math";

import {
  STRAIGHTEN_DEVIATION_THRESHOLD,
  STRAIGHTEN_CLOSE_THRESHOLD,
  STRAIGHTEN_CORNER_ANGLE,
  STRAIGHTEN_MIN_SCREEN_SIZE,
  STRAIGHTEN_MOVE_THRESHOLD,
  STRAIGHTEN_MOVE_THRESHOLD_TOUCH,
} from "@excalidraw/common";

import type { LocalPoint } from "@excalidraw/math";

const perpendicularDistance = (
  point: LocalPoint,
  lineStart: LocalPoint,
  lineEnd: LocalPoint,
): number => {
  const [px, py] = point;
  const [sx, sy] = lineStart;
  const [ex, ey] = lineEnd;
  const dx = ex - sx;
  const dy = ey - sy;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return pointDistance(point, lineStart);
  }
  return Math.abs(dy * px - dx * py + ex * sy - ey * sx) / Math.sqrt(lenSq);
};

export const maxDeviationFromLine = (points: readonly LocalPoint[]): number => {
  if (points.length <= 2) {
    return 0;
  }
  const start = points[0];
  const end = points[points.length - 1];
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > max) {
      max = d;
    }
  }
  return max;
};

export const pathLength = (points: readonly LocalPoint[]): number => {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += pointDistance(points[i - 1], points[i]);
  }
  return len;
};

// billion-dollars#6066 (F5): every distance threshold of straightening is
// screen pixels. The same handwriting is 2x larger in scene units at zoom 0.5
// and 3x smaller at zoom 3; scene-unit thresholds closed small letters when
// zoomed out and left large shapes open when zoomed in.

const AUTO_CLOSE_MIN_THRESHOLD = 1; // screen px
const AUTO_CLOSE_MAX_RATIO = 0.14;
const OVERSHOOT_TAIL_MIN_FRACTION = 0.65;
const CIRCLE_FIT_MAX_RMS_RATIO = 0.14;
const CIRCLE_ASPECT_MIN_RATIO = 0.85;
const ELLIPSE_FIT_MAX_RMS_RATIO = 0.16;
const ELLIPSE_ASPECT_MIN_RATIO = 0.18;
const ARC_FIT_MAX_RMS_RATIO = 0.08;
const ARC_MIN_SWEEP_RAD = Math.PI / 6; // 30 deg
const ARC_MAX_SWEEP_RAD = (Math.PI * 11) / 6; // 330 deg
const RECTANGLE_RIGHT_ANGLE_TOLERANCE_RAD = (14 * Math.PI) / 180;
const EDGE_SNAP_STEP_PX = 8;

const safeZoom = (zoom: number) =>
  Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getPointsBounds = (points: readonly LocalPoint[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { width: maxX - minX, height: maxY - minY };
};

/** The longer side of the stroke's bounding box on screen, px. */
export const getStrokeScreenSize = (
  points: readonly LocalPoint[],
  zoom: number,
): number => {
  if (points.length === 0) {
    return 0;
  }
  const { width, height } = getPointsBounds(points);
  return Math.max(width, height) * safeZoom(zoom);
};

/**
 * Keep the close gesture proportional to the mark size. A fixed 30px gap
 * makes compact strokes look closed even when the user only draws a small
 * open mark. Measured on screen; returned in scene units.
 */
export const getAutoCloseThreshold = (
  points: readonly LocalPoint[],
  zoom: number = 1,
): number => {
  const z = safeZoom(zoom);
  if (points.length === 0) {
    return AUTO_CLOSE_MIN_THRESHOLD / z;
  }

  const { width, height } = getPointsBounds(points);
  const diagonal = Math.hypot(width, height) * z;
  return (
    Math.min(
      STRAIGHTEN_CLOSE_THRESHOLD,
      Math.max(AUTO_CLOSE_MIN_THRESHOLD, diagonal * AUTO_CLOSE_MAX_RATIO),
    ) / z
  );
};

/**
 * How far (screen px) the pointer may wander and still hold for straightening:
 * a pen tip or a finger is never perfectly still (billion-dollars#6066, F4).
 */
export const getStraightenHoldRadius = (pointerType: string | undefined) =>
  pointerType === "touch"
    ? STRAIGHTEN_MOVE_THRESHOLD_TOUCH
    : STRAIGHTEN_MOVE_THRESHOLD;

const TRANSFORM_DEAD_ZONE_RATIO = 0.25;

/**
 * Dead zone (screen px) of the rotate/scale mode after straightening: moves
 * closer than this to where the hold ended leave the shape as straightened.
 * A quarter of the anchor distance, at least the hold radius (the tremor of
 * the hold itself) and at most twice that, so a small mark can still shrink.
 */
export const getStraightenTransformDeadZone = (
  anchorDistanceOnScreen: number,
  holdRadius: number,
) =>
  Math.min(
    2 * holdRadius,
    Math.max(holdRadius, anchorDistanceOnScreen * TRANSFORM_DEAD_ZONE_RATIO),
  );

export const FREEDRAW_TRANSFORM_MIN_SCALE = 0.01;
export const FREEDRAW_TRANSFORM_MAX_SCALE = 100;

export const getFreedrawTransformScale = (
  currentDistance: number,
  initialDistance: number,
): number => {
  const safeInitialDistance = Math.max(
    FREEDRAW_TRANSFORM_MIN_SCALE,
    initialDistance,
  );
  return Math.max(
    FREEDRAW_TRANSFORM_MIN_SCALE,
    Math.min(
      FREEDRAW_TRANSFORM_MAX_SCALE,
      currentDistance / safeInitialDistance,
    ),
  );
};

const buildCumulativeLengths = (points: readonly LocalPoint[]): number[] => {
  const cum = new Array<number>(points.length);
  cum[0] = 0;
  for (let i = 1; i < points.length; i++) {
    cum[i] = cum[i - 1] + pointDistance(points[i - 1], points[i]);
  }
  return cum;
};

/**
 * Smooth points using a weighted moving average.
 * Preserves start and end points exactly.
 * Output has same length as input — no rendering artifacts.
 */
const smoothPoints = (
  points: readonly LocalPoint[],
  radius: number = 3,
): LocalPoint[] => {
  const n = points.length;
  if (n <= 2) {
    return [...points];
  }

  const result: LocalPoint[] = new Array(n);
  result[0] = points[0];
  result[n - 1] = points[n - 1];

  for (let i = 1; i < n - 1; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n - 1, i + radius);
    let sumX = 0;
    let sumY = 0;
    let totalWeight = 0;
    for (let j = lo; j <= hi; j++) {
      const dist = Math.abs(j - i);
      const w = 1 / (1 + dist);
      sumX += points[j][0] * w;
      sumY += points[j][1] * w;
      totalWeight += w;
    }
    result[i] = pointFrom<LocalPoint>(sumX / totalWeight, sumY / totalWeight);
  }

  return result;
};

/**
 * Contract points symmetrically toward the gap midpoint to close a nearly-closed shape.
 * Both endpoints meet at mid = (start + end) / 2 while the middle of the stroke stays anchored.
 * Preserves point count.
 */
const contractToClose = (points: readonly LocalPoint[]): LocalPoint[] => {
  const n = points.length;
  if (n < 2) {
    return [...points];
  }
  const last = n - 1;
  const gapX = points[last][0] - points[0][0];
  const gapY = points[last][1] - points[0][1];

  return points.map((p, i) => {
    const t = i / last;
    // Start moves +0.5*gap*(1-t)^2, end moves -0.5*gap*t^2: meets cleanly at midpoint
    const shift = 0.5 * (1 - t) * (1 - t) - 0.5 * t * t;
    return pointFrom<LocalPoint>(p[0] + shift * gapX, p[1] + shift * gapY);
  });
};

/**
 * Sample a point along a polyline (optionally cyclic for closed strokes) at
 * a given target arc distance offset from index `idx`.
 */
const samplePointAtArcOffset = (
  points: readonly LocalPoint[],
  cumLen: readonly number[],
  idx: number,
  offset: number,
  isClosed: boolean,
): LocalPoint => {
  const n = points.length;
  const totalLen = cumLen[n - 1];
  if (totalLen <= 0 || n < 2) {
    return points[idx];
  }

  if (!isClosed) {
    const target = clamp(cumLen[idx] + offset, 0, totalLen);
    if (offset < 0) {
      for (let k = idx; k > 0; k--) {
        if (cumLen[k - 1] <= target) {
          const segLen = cumLen[k] - cumLen[k - 1];
          const f = segLen > 0 ? (target - cumLen[k - 1]) / segLen : 0;
          return pointFrom<LocalPoint>(
            points[k - 1][0] + (points[k][0] - points[k - 1][0]) * f,
            points[k - 1][1] + (points[k][1] - points[k - 1][1]) * f,
          );
        }
      }
      return points[0];
    }
    for (let k = idx; k < n - 1; k++) {
      if (cumLen[k + 1] >= target) {
        const segLen = cumLen[k + 1] - cumLen[k];
        const f = segLen > 0 ? (target - cumLen[k]) / segLen : 0;
        return pointFrom<LocalPoint>(
          points[k][0] + (points[k + 1][0] - points[k][0]) * f,
          points[k][1] + (points[k + 1][1] - points[k][1]) * f,
        );
      }
    }
    return points[n - 1];
  }

  // Closed stroke: points[0] == points[n-1], wrap around loop of unique n - 1 vertices
  const loopCount = n - 1;
  const clampedTarget =
    (((cumLen[idx] + offset) % totalLen) + totalLen) % totalLen;
  for (let k = 0; k < loopCount; k++) {
    const a = cumLen[k];
    const b = cumLen[k + 1];
    if (clampedTarget >= a && clampedTarget <= b) {
      const segLen = b - a;
      const f = segLen > 0 ? (clampedTarget - a) / segLen : 0;
      return pointFrom<LocalPoint>(
        points[k][0] + (points[k + 1][0] - points[k][0]) * f,
        points[k][1] + (points[k + 1][1] - points[k][1]) * f,
      );
    }
  }
  return points[0];
};

const cyclicArcDistance = (a: number, b: number, totalLen: number): number => {
  const diff = Math.abs(a - b);
  return Math.min(diff, totalLen - diff);
};

/**
 * Detect corner points by measuring direction change over an arc-length window
 * (independent of sampling rate 60-240 Hz and zoom).
 * Returns sorted array of unique corner indices.
 */
const detectCorners = (
  points: readonly LocalPoint[],
  isClosed: boolean,
  zoom: number,
): number[] => {
  const n = points.length;
  if (n < 3) {
    return [];
  }
  const cumLen = buildCumulativeLengths(points);
  const totalLen = cumLen[n - 1];
  if (totalLen <= 0) {
    return [];
  }

  const z = safeZoom(zoom);
  const winLen = clamp(totalLen * 0.06, 8 / z, 28 / z);
  const endpointGuard = 4 / z;
  const minSegChord = 1 / z;
  const angleThreshold = (STRAIGHTEN_CORNER_ANGLE * Math.PI) / 180;
  const angles: { idx: number; arc: number; angle: number }[] = [];

  const startIdx = isClosed ? 0 : 1;
  const endIdx = isClosed ? n - 2 : n - 2;

  for (let i = startIdx; i <= endIdx; i++) {
    if (
      !isClosed &&
      (cumLen[i] < endpointGuard || totalLen - cumLen[i] < endpointGuard)
    ) {
      continue;
    }

    const beforePt = samplePointAtArcOffset(
      points,
      cumLen,
      i,
      -winLen,
      isClosed,
    );
    const afterPt = samplePointAtArcOffset(points, cumLen, i, winLen, isClosed);
    const midBack = samplePointAtArcOffset(
      points,
      cumLen,
      i,
      -winLen * 0.25,
      isClosed,
    );
    const midFwd = samplePointAtArcOffset(
      points,
      cumLen,
      i,
      winLen * 0.25,
      isClosed,
    );
    // Light arc-length local denoising suppresses single-sample stylus jitter while preserving crisp polygon vertices
    const centerX = points[i][0] * 0.5 + (midBack[0] + midFwd[0]) * 0.25;
    const centerY = points[i][1] * 0.5 + (midBack[1] + midFwd[1]) * 0.25;

    const bx = centerX - beforePt[0];
    const by = centerY - beforePt[1];
    const ax = afterPt[0] - centerX;
    const ay = afterPt[1] - centerY;

    const lenB = Math.hypot(bx, by);
    const lenA = Math.hypot(ax, ay);
    if (lenB < minSegChord || lenA < minSegChord) {
      continue;
    }

    const dot = (bx * ax + by * ay) / (lenB * lenA);
    const angle = Math.acos(clamp(dot, -1, 1));

    if (angle > angleThreshold) {
      angles.push({ idx: i, arc: cumLen[i], angle });
    }
  }

  // Non-maximum suppression using arc-length neighborhood (cyclic for closed strokes)
  const nmsRadius = Math.max(winLen * 1.15, 14 / z);
  const corners: number[] = [];
  for (const candidate of angles) {
    const dominated = angles.some((other) => {
      if (other === candidate) {
        return false;
      }
      const dist = isClosed
        ? cyclicArcDistance(other.arc, candidate.arc, totalLen)
        : Math.abs(other.arc - candidate.arc);
      if (dist > nmsRadius) {
        return false;
      }
      return (
        other.angle > candidate.angle ||
        (other.angle === candidate.angle && other.idx < candidate.idx)
      );
    });
    if (!dominated) {
      corners.push(candidate.idx);
    }
  }

  return corners.sort((a, b) => a - b);
};

/**
 * Smooth points with cyclic wrapping (for closed shapes).
 * Points near start/end average across the seam.
 * Preserves point count.
 */
const smoothPointsCyclic = (
  points: readonly LocalPoint[],
  radius: number = 3,
): LocalPoint[] => {
  const n = points.length;
  if (n <= 2) {
    return [...points];
  }

  const loopLen = n - 1;
  const result: LocalPoint[] = new Array(n);

  for (let i = 0; i < loopLen; i++) {
    let sumX = 0;
    let sumY = 0;
    let totalWeight = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const j = (((i + offset) % loopLen) + loopLen) % loopLen;
      const w = 1 / (1 + Math.abs(offset));
      sumX += points[j][0] * w;
      sumY += points[j][1] * w;
      totalWeight += w;
    }
    result[i] = pointFrom<LocalPoint>(sumX / totalWeight, sumY / totalWeight);
  }

  result[n - 1] = result[0];
  return result;
};

type WeightedEdgeStats = {
  cx: number;
  cy: number;
  totalWeight: number;
};

const computeArcCentroid = (
  points: readonly LocalPoint[],
  isClosed: boolean,
): WeightedEdgeStats => {
  const count = isClosed ? points.length - 1 : points.length - 1;
  let sx = 0;
  let sy = 0;
  let totalW = 0;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ds = Math.max(1e-4, pointDistance(a, b));
    sx += (a[0] + b[0]) * 0.5 * ds;
    sy += (a[1] + b[1]) * 0.5 * ds;
    totalW += ds;
  }
  if (totalW <= 0) {
    return { cx: points[0][0], cy: points[0][1], totalWeight: 1 };
  }
  return { cx: sx / totalW, cy: sy / totalW, totalWeight: totalW };
};

/**
 * Solve 3x3 symmetric linear system A * sol = rhs via Gaussian elimination with partial pivoting.
 */
const solve3x3 = (
  A: number[][],
  rhs: number[],
): [number, number, number] | null => {
  const m = [
    [A[0][0], A[0][1], A[0][2], rhs[0]],
    [A[1][0], A[1][1], A[1][2], rhs[1]],
    [A[2][0], A[2][1], A[2][2], rhs[2]],
  ];

  for (let col = 0; col < 3; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivotRow][col])) {
        pivotRow = r;
      }
    }
    if (Math.abs(m[pivotRow][col]) < 1e-10) {
      return null;
    }
    if (pivotRow !== col) {
      [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
    }
    const diag = m[col][col];
    for (let r = col + 1; r < 3; r++) {
      const factor = m[r][col] / diag;
      for (let c = col; c < 4; c++) {
        m[r][c] -= factor * m[col][c];
      }
    }
  }

  const x2 = m[2][3] / m[2][2];
  const x1 = (m[1][3] - m[1][2] * x2) / m[1][1];
  const x0 = (m[0][3] - m[0][1] * x1 - m[0][2] * x2) / m[0][0];
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(x2)) {
    return null;
  }
  return [x0, x1, x2];
};

type FittedCircle = {
  cx: number;
  cy: number;
  r: number;
  rmsRatio: number;
};

/** Arc-length-weighted Kasa circle fit relative to centroid. */
const fitCircleWeighted = (
  points: readonly LocalPoint[],
  isClosed: boolean,
): FittedCircle | null => {
  if (points.length < 6) {
    return null;
  }
  const { cx: refX, cy: refY } = computeArcCentroid(points, isClosed);
  const edgeCount = points.length - 1;

  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rhs = [0, 0, 0];
  let totalW = 0;

  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ds = Math.max(1e-4, pointDistance(a, b));
    const ux = (a[0] + b[0]) * 0.5 - refX;
    const uy = (a[1] + b[1]) * 0.5 - refY;
    const rhsVal = ux * ux + uy * uy;

    A[0][0] += ds * 2 * ux * ux;
    A[0][1] += ds * 2 * ux * uy;
    A[0][2] += ds * 2 * ux;
    A[1][1] += ds * 2 * uy * uy;
    A[1][2] += ds * 2 * uy;
    A[2][2] += ds;

    rhs[0] += ds * 2 * ux * rhsVal;
    rhs[1] += ds * 2 * uy * rhsVal;
    rhs[2] += ds * rhsVal;
    totalW += ds;
  }
  A[1][0] = A[0][1];
  A[2][0] = A[0][2];
  A[2][1] = A[1][2];
  // Divide row 0,1 factor symmetry (A has factor 2 on first cols)
  A[0][0] *= 2;
  A[0][1] *= 2;
  A[1][0] *= 2;
  A[1][1] *= 2;

  const sol = solve3x3(A, rhs);
  if (!sol) {
    return null;
  }
  const [ucx, ucy, c] = sol;
  const rSq = ucx * ucx + ucy * ucy + c;
  if (!(rSq > 1)) {
    return null;
  }
  const cx = refX + ucx;
  const cy = refY + ucy;
  const r = Math.sqrt(rSq);

  let errSqSum = 0;
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ds = Math.max(1e-4, pointDistance(a, b));
    const mx = (a[0] + b[0]) * 0.5 - cx;
    const my = (a[1] + b[1]) * 0.5 - cy;
    const d = Math.hypot(mx, my) - r;
    errSqSum += ds * d * d;
  }
  const rmsRatio = Math.sqrt(errSqSum / totalW) / r;
  return { cx, cy, r, rmsRatio };
};

type FittedClosedShape = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  rmsRatio: number;
  isCircle: boolean;
};

/**
 * Fit either a true circle or a PCA-oriented ellipse to a smooth closed curve.
 * Returns null if the stroke is too irregular / non-elliptical.
 */
const fitClosedCircleOrEllipse = (
  points: readonly LocalPoint[],
): FittedClosedShape | null => {
  if (points.length < 8) {
    return null;
  }

  const { cx, cy, totalWeight } = computeArcCentroid(points, true);
  let covXX = 0;
  let covXY = 0;
  let covYY = 0;
  const edgeCount = points.length - 1;

  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ds = Math.max(1e-4, pointDistance(a, b));
    const dx = (a[0] + b[0]) * 0.5 - cx;
    const dy = (a[1] + b[1]) * 0.5 - cy;
    covXX += ds * dx * dx;
    covXY += ds * dx * dy;
    covYY += ds * dy * dy;
  }
  covXX /= totalWeight;
  covXY /= totalWeight;
  covYY /= totalWeight;

  const trace = covXX + covYY;
  const diff = covXX - covYY;
  const disc = Math.sqrt(diff * diff + 4 * covXY * covXY);
  const lambda1 = Math.max(0, (trace + disc) * 0.5);
  const lambda2 = Math.max(0, (trace - disc) * 0.5);
  if (lambda1 <= 0 || lambda2 <= 0) {
    return null;
  }

  const angle = 0.5 * Math.atan2(2 * covXY, diff);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  let rx = Math.sqrt(2 * lambda1);
  let ry = Math.sqrt(2 * lambda2);
  if (ry / rx < ELLIPSE_ASPECT_MIN_RATIO) {
    return null;
  }

  // Refine overall scale radially so contour matches drawn points cleanly
  let normSum = 0;
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ds = Math.max(1e-4, pointDistance(a, b));
    const dx = (a[0] + b[0]) * 0.5 - cx;
    const dy = (a[1] + b[1]) * 0.5 - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    const q = Math.hypot(u / rx, v / ry);
    normSum += ds * q;
  }
  const scaleFactor = normSum / totalWeight;
  if (scaleFactor > 0.5 && scaleFactor < 1.5) {
    rx *= scaleFactor;
    ry *= scaleFactor;
  }

  const circleFit = fitCircleWeighted(points, true);
  if (
    circleFit &&
    ry / rx >= CIRCLE_ASPECT_MIN_RATIO &&
    circleFit.rmsRatio <= CIRCLE_FIT_MAX_RMS_RATIO
  ) {
    return {
      cx: circleFit.cx,
      cy: circleFit.cy,
      rx: circleFit.r,
      ry: circleFit.r,
      angle: 0,
      rmsRatio: circleFit.rmsRatio,
      isCircle: true,
    };
  }

  // Evaluate radial distance error to fitted rotated ellipse
  const meanR = Math.sqrt(rx * ry);
  let errSqSum = 0;
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ds = Math.max(1e-4, pointDistance(a, b));
    const dx = (a[0] + b[0]) * 0.5 - cx;
    const dy = (a[1] + b[1]) * 0.5 - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    const actualR = Math.hypot(u, v);
    const radialUnit = Math.hypot(u / rx, v / ry);
    const targetR = radialUnit > 1e-6 ? actualR / radialUnit : meanR;
    const err = actualR - targetR;
    errSqSum += ds * err * err;
  }
  const ellipseRms = Math.sqrt(errSqSum / totalWeight) / meanR;
  if (ellipseRms <= ELLIPSE_FIT_MAX_RMS_RATIO) {
    return {
      cx,
      cy,
      rx,
      ry,
      angle,
      rmsRatio: ellipseRms,
      isCircle: false,
    };
  }

  return null;
};

/**
 * Signed winding direction (+1 CCW or -1 CW) in screen space around (cx, cy).
 */
const getLoopWinding = (
  points: readonly LocalPoint[],
  cx: number,
  cy: number,
): 1 | -1 => {
  let area2 = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const x1 = points[i][0] - cx;
    const y1 = points[i][1] - cy;
    const x2 = points[i + 1][0] - cx;
    const y2 = points[i + 1][1] - cy;
    area2 += x1 * y2 - x2 * y1;
  }
  return area2 >= 0 ? 1 : -1;
};

const projectPointOntoFittedEllipse = (
  pt: LocalPoint,
  fit: FittedClosedShape,
): LocalPoint => {
  const cos = Math.cos(fit.angle);
  const sin = Math.sin(fit.angle);
  const dx = pt[0] - fit.cx;
  const dy = pt[1] - fit.cy;
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  const theta = Math.atan2(v / fit.ry, u / fit.rx);
  const ex = fit.rx * Math.cos(theta);
  const ey = fit.ry * Math.sin(theta);
  return pointFrom<LocalPoint>(
    fit.cx + ex * cos - ey * sin,
    fit.cy + ex * sin + ey * cos,
  );
};

const sampleFittedEllipseLoop = (
  startPoint: LocalPoint,
  fit: FittedClosedShape,
  winding: 1 | -1,
  count: number,
): LocalPoint[] => {
  const cos = Math.cos(fit.angle);
  const sin = Math.sin(fit.angle);
  const dx = startPoint[0] - fit.cx;
  const dy = startPoint[1] - fit.cy;
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  const startTheta = Math.atan2(v / fit.ry, u / fit.rx);

  const out: LocalPoint[] = new Array(count);
  for (let i = 0; i < count - 1; i++) {
    const theta = startTheta + winding * ((2 * Math.PI * i) / (count - 1));
    const ex = fit.rx * Math.cos(theta);
    const ey = fit.ry * Math.sin(theta);
    out[i] = pointFrom<LocalPoint>(
      fit.cx + ex * cos - ey * sin,
      fit.cy + ex * sin + ey * cos,
    );
  }
  out[count - 1] = out[0];
  return out;
};

/**
 * Try fitting a smooth open circular arc to a non-straight open curve.
 * Preserves the endpoint tangent angles closely while eliminating wobble.
 */
const tryBuildOpenCircularArc = (
  points: readonly LocalPoint[],
): StraightenResult | null => {
  const fit = fitCircleWeighted(points, false);
  if (!fit || fit.rmsRatio > ARC_FIT_MAX_RMS_RATIO) {
    return null;
  }

  // Unwrap angles along the stroke and verify monotonic progression
  const unwrapped = new Array<number>(points.length);
  unwrapped[0] = Math.atan2(points[0][1] - fit.cy, points[0][0] - fit.cx);
  let minA = unwrapped[0];
  let maxA = unwrapped[0];
  for (let i = 1; i < points.length; i++) {
    const raw = Math.atan2(points[i][1] - fit.cy, points[i][0] - fit.cx);
    let delta = raw - (unwrapped[i - 1] % (2 * Math.PI));
    while (delta > Math.PI) {
      delta -= 2 * Math.PI;
    }
    while (delta < -Math.PI) {
      delta += 2 * Math.PI;
    }
    unwrapped[i] = unwrapped[i - 1] + delta;
    minA = Math.min(minA, unwrapped[i]);
    maxA = Math.max(maxA, unwrapped[i]);
  }

  const startA = unwrapped[0];
  const endA = unwrapped[unwrapped.length - 1];
  const sweep = Math.abs(endA - startA);
  const totalSpan = maxA - minA;
  if (
    sweep < ARC_MIN_SWEEP_RAD ||
    sweep > ARC_MAX_SWEEP_RAD ||
    totalSpan > sweep * 1.15
  ) {
    return null;
  }

  const dir = endA >= startA ? 1 : -1;
  const animationTargets = unwrapped.map((a) => {
    const clampedA = dir > 0 ? clamp(a, startA, endA) : clamp(a, endA, startA);
    return pointFrom<LocalPoint>(
      fit.cx + fit.r * Math.cos(clampedA),
      fit.cy + fit.r * Math.sin(clampedA),
    );
  });

  const stepCount = Math.max(
    24,
    Math.min(72, Math.ceil((sweep * 180) / (Math.PI * 3))),
  );
  const finalPoints: LocalPoint[] = [];
  for (let i = 0; i <= stepCount; i++) {
    const a = startA + ((endA - startA) * i) / stepCount;
    finalPoints.push(
      pointFrom<LocalPoint>(
        fit.cx + fit.r * Math.cos(a),
        fit.cy + fit.r * Math.sin(a),
      ),
    );
  }

  return { animationTargets, finalPoints };
};

/**
 * Sample points cleanly along a straight segment [a, b] while keeping enough
 * intermediate points for perfect-freehand / centerline dash rendering so corners stay crisp.
 */
const sampleStraightSegment = (
  a: LocalPoint,
  b: LocalPoint,
  zoom: number,
  includeEnd: boolean,
): LocalPoint[] => {
  const len = pointDistance(a, b);
  const stepScene = EDGE_SNAP_STEP_PX / safeZoom(zoom);
  const steps = Math.max(3, Math.ceil(len / stepScene));
  const out: LocalPoint[] = [];
  const limit = includeEnd ? steps : steps - 1;
  for (let i = 0; i <= limit; i++) {
    const t = i / steps;
    out.push(
      pointFrom<LocalPoint>(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t),
    );
  }
  return out;
};

/**
 * If a closed 4-vertex polygon has all interior angles close to 90°,
 * regularize it into a crisp oriented rectangle with preserved area & center.
 */
const maybeRegularizeRectangle = (
  vertices: LocalPoint[],
): LocalPoint[] | null => {
  if (vertices.length !== 4) {
    return null;
  }

  for (let i = 0; i < 4; i++) {
    const prev = vertices[(i + 3) % 4];
    const curr = vertices[i];
    const next = vertices[(i + 1) % 4];
    const v1x = prev[0] - curr[0];
    const v1y = prev[1] - curr[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 1 || l2 < 1) {
      return null;
    }
    const cos = clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1);
    const angle = Math.acos(cos);
    if (Math.abs(angle - Math.PI / 2) > RECTANGLE_RIGHT_ANGLE_TOLERANCE_RAD) {
      return null;
    }
  }

  // Average the two primary edge directions (rotated so all sides agree cleanly)
  const e0x = vertices[1][0] - vertices[0][0];
  const e0y = vertices[1][1] - vertices[0][1];
  const e1x = vertices[2][0] - vertices[1][0];
  const e1y = vertices[2][1] - vertices[1][1];
  const e2x = vertices[2][0] - vertices[3][0];
  const e2y = vertices[2][1] - vertices[3][1];
  const e3x = vertices[3][0] - vertices[0][0];
  const e3y = vertices[3][1] - vertices[0][1];

  const dirU = pointFrom(e0x + e2x, e0y + e2y);
  const lenU = Math.hypot(dirU[0], dirU[1]);
  if (lenU < 1e-3) {
    return null;
  }
  const ux = dirU[0] / lenU;
  const uy = dirU[1] / lenU;
  // Orthogonal vector chosen to match edges 1 & 3 orientation
  let vx = -uy;
  let vy = ux;
  if ((e1x + e3x) * vx + (e1y + e3y) * vy < 0) {
    vx = -vx;
    vy = -vy;
  }

  const cx =
    (vertices[0][0] + vertices[1][0] + vertices[2][0] + vertices[3][0]) / 4;
  const cy =
    (vertices[0][1] + vertices[1][1] + vertices[2][1] + vertices[3][1]) / 4;
  const halfW = (Math.hypot(e0x, e0y) + Math.hypot(e2x, e2y)) / 4;
  const halfH = (Math.hypot(e1x, e1y) + Math.hypot(e3x, e3y)) / 4;

  // Map vertices symmetrically around center using sign projections of vertex 0
  const d0x = vertices[0][0] - cx;
  const d0y = vertices[0][1] - cy;
  const su0 = d0x * ux + d0y * uy >= 0 ? 1 : -1;
  const sv0 = d0x * vx + d0y * vy >= 0 ? 1 : -1;

  const cornerAt = (su: number, sv: number) =>
    pointFrom<LocalPoint>(
      cx + su * halfW * ux + sv * halfH * vx,
      cy + su * halfW * uy + sv * halfH * vy,
    );

  // Order follows original winding around vertices[0] -> vertices[1] -> vertices[2] -> vertices[3]
  return [
    cornerAt(su0, sv0),
    cornerAt(-su0, sv0),
    cornerAt(-su0, -sv0),
    cornerAt(su0, -sv0),
  ];
};

const projectOntoSegment = (
  p: LocalPoint,
  a: LocalPoint,
  b: LocalPoint,
): LocalPoint => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) {
    return a;
  }
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq, 0, 1);
  return pointFrom<LocalPoint>(a[0] + dx * t, a[1] + dy * t);
};

/**
 * Try building a crisp polyline / polygon (including triangles & rectangles) when corners are detected.
 */
const tryBuildCornerPolyline = (
  points: readonly LocalPoint[],
  corners: number[],
  isClosed: boolean,
  zoom: number,
): StraightenResult | null => {
  if (corners.length === 0) {
    return null;
  }

  // If closed stroke doesn't already list corner 0, vertices are the corner indices itself
  const n = points.length;
  if (isClosed) {
    if (corners.length < 3) {
      return null;
    }

    // Build edge index spans around the cyclic loop
    const edgeSpans: {
      startIdx: number;
      endIdx: number;
      spanPts: LocalPoint[];
    }[] = [];
    for (let k = 0; k < corners.length; k++) {
      const startIdx = corners[k];
      const endIdx = corners[(k + 1) % corners.length];
      const spanPts: LocalPoint[] = [];
      let idx = startIdx;
      spanPts.push(points[idx]);
      while (idx !== endIdx) {
        idx = (idx + 1) % (n - 1);
        spanPts.push(points[idx]);
        if (spanPts.length > n + 2) {
          break;
        }
      }
      edgeSpans.push({ startIdx, endIdx, spanPts });
    }

    const straightCount = edgeSpans.filter(({ spanPts }) => {
      const sp = spanPts[0];
      const ep = spanPts[spanPts.length - 1];
      const len = pointDistance(sp, ep);
      return (
        len > 1 &&
        maxDeviationFromLine(spanPts) / len <
          STRAIGHTEN_DEVIATION_THRESHOLD * 1.35
      );
    }).length;

    if (straightCount === edgeSpans.length) {
      let vertices = corners.map((idx) => points[idx]);
      const rect = maybeRegularizeRectangle(vertices);
      if (rect) {
        vertices = rect;
      }

      const animationTargets: LocalPoint[] = new Array(n);
      for (let k = 0; k < edgeSpans.length; k++) {
        const va = vertices[k];
        const vb = vertices[(k + 1) % vertices.length];
        const { startIdx, endIdx } = edgeSpans[k];
        let idx = startIdx;
        while (true) {
          animationTargets[idx] = projectOntoSegment(points[idx], va, vb);
          if (idx === endIdx) {
            break;
          }
          idx = (idx + 1) % (n - 1);
        }
      }
      animationTargets[n - 1] = animationTargets[0];

      // Sample crisp polygon starting at vertex 0 (matching animationTargets seam)
      const finalPoints: LocalPoint[] = [];
      for (let k = 0; k < vertices.length; k++) {
        const va = vertices[k];
        const vb = vertices[(k + 1) % vertices.length];
        finalPoints.push(
          ...sampleStraightSegment(va, vb, zoom, k === vertices.length - 1),
        );
      }
      finalPoints[finalPoints.length - 1] = finalPoints[0];

      return { animationTargets, finalPoints };
    }
  } else {
    // Open polyline: boundaries = [0, ...corners, n - 1]
    const boundaries = [0, ...corners, n - 1];
    const straightSegments: boolean[] = [];
    for (let s = 0; s < boundaries.length - 1; s++) {
      const seg = points.slice(boundaries[s], boundaries[s + 1] + 1);
      const len = pointDistance(seg[0], seg[seg.length - 1]);
      straightSegments.push(
        len > 1 &&
          maxDeviationFromLine(seg) / len <
            STRAIGHTEN_DEVIATION_THRESHOLD * 1.25,
      );
    }

    if (straightSegments.every(Boolean)) {
      const vertices = boundaries.map((idx) => points[idx]);
      const animationTargets: LocalPoint[] = [...points];
      for (let s = 0; s < boundaries.length - 1; s++) {
        const a = boundaries[s];
        const b = boundaries[s + 1];
        for (let i = a; i <= b; i++) {
          animationTargets[i] = projectOntoSegment(
            points[i],
            vertices[s],
            vertices[s + 1],
          );
        }
      }
      const finalPoints: LocalPoint[] = [];
      for (let s = 0; s < vertices.length - 1; s++) {
        finalPoints.push(
          ...sampleStraightSegment(
            vertices[s],
            vertices[s + 1],
            zoom,
            s === vertices.length - 2,
          ),
        );
      }
      return { animationTargets, finalPoints };
    }
  }

  return null;
};

/**
 * Fallback mixed corner smoothing (e.g., D-shapes with one curved & one straight side).
 */
const smoothBySegments = (
  points: readonly LocalPoint[],
  corners: number[],
  isClosed: boolean,
  radius: number = 3,
): LocalPoint[] => {
  if (corners.length === 0) {
    return isClosed
      ? smoothPointsCyclic(points, radius)
      : smoothPoints(points, radius);
  }

  const result: LocalPoint[] = [...points];
  const boundaries =
    corners[0] === 0 && corners[corners.length - 1] === points.length - 1
      ? corners
      : corners[0] === 0
      ? [...corners, points.length - 1]
      : [0, ...corners, points.length - 1];

  for (let s = 0; s < boundaries.length - 1; s++) {
    const segStart = boundaries[s];
    const segEnd = boundaries[s + 1];
    const segLen = segEnd - segStart + 1;

    if (segLen <= 2) {
      continue;
    }

    const segment = points.slice(segStart, segEnd + 1);
    const sp = points[segStart];
    const ep = points[segEnd];
    const segLineLen = pointDistance(sp, ep);
    const segDeviation = maxDeviationFromLine(segment);

    if (
      segLineLen > 1 &&
      segDeviation / segLineLen < STRAIGHTEN_DEVIATION_THRESHOLD
    ) {
      const dx = ep[0] - sp[0];
      const dy = ep[1] - sp[1];
      const lenSq = dx * dx + dy * dy;

      for (let i = 1; i < segLen - 1; i++) {
        const p = points[segStart + i];
        const t =
          lenSq > 0
            ? clamp(((p[0] - sp[0]) * dx + (p[1] - sp[1]) * dy) / lenSq, 0, 1)
            : 0;
        result[segStart + i] = pointFrom<LocalPoint>(
          sp[0] + dx * t,
          sp[1] + dy * t,
        );
      }
    } else {
      const smoothed = smoothPoints(segment, radius);
      for (let i = 1; i < smoothed.length - 1; i++) {
        result[segStart + i] = smoothed[i];
      }
    }
  }

  if (isClosed && corners.length >= 2) {
    const n = points.length;
    const lastCorner = corners[corners.length - 1];
    const firstCorner = corners[0];
    const seamStart = result[lastCorner];
    const seamEnd = result[firstCorner];
    const seamLineLen = pointDistance(seamStart, seamEnd);

    const seamPts: LocalPoint[] = [seamStart];
    const seamCount = n - 1 - lastCorner + firstCorner;
    for (let k = 1; k < seamCount; k++) {
      const idx = (lastCorner + k) % (n - 1);
      if (idx === firstCorner) {
        break;
      }
      seamPts.push(result[idx]);
    }
    seamPts.push(seamEnd);

    const seamDeviation = maxDeviationFromLine(seamPts);
    if (
      seamLineLen > 1 &&
      seamDeviation / seamLineLen < STRAIGHTEN_DEVIATION_THRESHOLD
    ) {
      const sdx = seamEnd[0] - seamStart[0];
      const sdy = seamEnd[1] - seamStart[1];
      const sLenSq = sdx * sdx + sdy * sdy;
      for (let k = 1; k < seamCount; k++) {
        const idx = (lastCorner + k) % (n - 1);
        if (idx === firstCorner) {
          break;
        }
        const t = sLenSq > 0 ? clamp(k / seamCount, 0, 1) : 0;
        result[idx] = pointFrom<LocalPoint>(
          seamStart[0] + sdx * t,
          seamStart[1] + sdy * t,
        );
      }
    } else {
      const loopLen = n - 1;
      for (let k = 1; k < seamCount; k++) {
        const idx = (lastCorner + k) % loopLen;
        if (idx === firstCorner) {
          break;
        }
        let sumX = 0;
        let sumY = 0;
        let totalWeight = 0;
        for (let j = -radius; j <= radius; j++) {
          const neighbor = (((idx + j) % loopLen) + loopLen) % loopLen;
          const w = 1 / (1 + Math.abs(j));
          sumX += result[neighbor][0] * w;
          sumY += result[neighbor][1] * w;
          totalWeight += w;
        }
        result[idx] = pointFrom<LocalPoint>(
          sumX / totalWeight,
          sumY / totalWeight,
        );
      }
    }
    result[n - 1] = result[0];
  }

  return result;
};

/**
 * Look for a small overshoot tail where the stroke passed near the starting
 * point (after drawing at least 65% of its total path length).
 */
const findOvershootCloseIndex = (
  points: readonly LocalPoint[],
  closeThreshold: number,
  minClosedScreenLength: number,
  zoom: number,
): number | null => {
  const n = points.length;
  if (n < 8) {
    return null;
  }
  const cumLen = buildCumulativeLengths(points);
  const totalLen = cumLen[n - 1];
  const minArc = Math.max(
    totalLen * OVERSHOOT_TAIL_MIN_FRACTION,
    minClosedScreenLength / zoom,
  );
  let bestIdx = -1;
  let bestDist = closeThreshold;
  for (let i = 1; i < n - 1; i++) {
    if (cumLen[i] < minArc) {
      continue;
    }
    const d = pointDistance(points[i], points[0]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 ? bestIdx : null;
};

export type StraightenResult = {
  /** Same length as original points — used for per-point animation */
  animationTargets: LocalPoint[];
  /** Final points to set on the element (may be fewer) */
  finalPoints: LocalPoint[];
};

/**
 * Compute Procreate-style straightening targets for a freedraw stroke:
 *
 * 1. Size guard: strokes smaller than STRAIGHTEN_MIN_SCREEN_SIZE stay handwriting.
 * 2. Closure detection: symmetric gap closure OR trimming small overshoot tails.
 * 3. Lines: low deviation open strokes snap to a straight segment.
 * 4. Polygons / polylines: arc-length corner detection snaps clean segments
 *    (with 90° rectangle regularization when appropriate).
 * 5. Circles & ellipses: closed smooth curves fit a true circle or rotated ellipse.
 * 6. Circular arcs: open smooth curves matching a circle arc snap cleanly.
 */
export const computeStraightenResult = (
  points: readonly LocalPoint[],
  zoom: number = 1,
): StraightenResult | null => {
  if (points.length < 2) {
    return null;
  }

  const z = safeZoom(zoom);
  if (getStrokeScreenSize(points, z) < STRAIGHTEN_MIN_SCREEN_SIZE) {
    return null;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const gapDist = pointDistance(start, end);
  const totalLen = pathLength(points);
  const closeThreshold = getAutoCloseThreshold(points, z);
  const minLoopScreenLen = STRAIGHTEN_CLOSE_THRESHOLD * 3;

  // Step 1: Closure detection (direct gap or slight overshoot past start)
  let isClosed = false;
  let overshootTailCount = 0;
  let workingPoints: LocalPoint[];

  if (gapDist < closeThreshold && totalLen * z > minLoopScreenLen) {
    workingPoints = contractToClose(points);
    isClosed = true;
  } else {
    const overshootIdx =
      totalLen * z > minLoopScreenLen
        ? findOvershootCloseIndex(points, closeThreshold, minLoopScreenLen, z)
        : null;
    if (overshootIdx !== null) {
      overshootTailCount = points.length - 1 - overshootIdx;
      workingPoints = contractToClose(points.slice(0, overshootIdx + 1));
      isClosed = true;
    } else {
      workingPoints = [...points] as LocalPoint[];
    }
  }

  const padTail = (result: StraightenResult): StraightenResult => {
    if (overshootTailCount === 0) {
      return result;
    }
    const anchor = result.animationTargets[0];
    const tail = new Array<LocalPoint>(overshootTailCount).fill(anchor);
    return {
      animationTargets: [...result.animationTargets, ...tail],
      finalPoints: result.finalPoints,
    };
  };

  // Step 2: Straight line check (open strokes)
  if (!isClosed) {
    const lineLen = pointDistance(
      workingPoints[0],
      workingPoints[workingPoints.length - 1],
    );
    if (lineLen * z < 1) {
      return null;
    }
    const deviation = maxDeviationFromLine(workingPoints);
    if (deviation / lineLen < STRAIGHTEN_DEVIATION_THRESHOLD) {
      const s = workingPoints[0];
      const e = workingPoints[workingPoints.length - 1];
      const dx = e[0] - s[0];
      const dy = e[1] - s[1];
      const lenSq = dx * dx + dy * dy;

      const animationTargets = workingPoints.map((p) => {
        const t = clamp(
          ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / lenSq,
          0,
          1,
        );
        return pointFrom<LocalPoint>(s[0] + dx * t, s[1] + dy * t);
      });

      return { animationTargets, finalPoints: animationTargets };
    }
  }

  // Step 3: Arc-length corner detection & polygon / polyline fitting
  let corners = detectCorners(workingPoints, isClosed, z);
  if (corners.length > Math.max(8, workingPoints.length * 0.25)) {
    corners = [];
  }

  const polyline = tryBuildCornerPolyline(workingPoints, corners, isClosed, z);
  if (polyline) {
    return padTail(polyline);
  }

  // Step 4: Circle / ellipse / circular arc fitting for smooth strokes
  if (isClosed && corners.length <= 2) {
    const closedFit = fitClosedCircleOrEllipse(workingPoints);
    const maxClosedRms =
      corners.length === 0 ? ELLIPSE_FIT_MAX_RMS_RATIO : 0.08;
    if (closedFit && closedFit.rmsRatio <= maxClosedRms) {
      const animationTargets = workingPoints.map((p) =>
        projectPointOntoFittedEllipse(p, closedFit),
      );
      animationTargets[animationTargets.length - 1] = animationTargets[0];
      const winding = getLoopWinding(workingPoints, closedFit.cx, closedFit.cy);
      const targetCount = Math.max(65, Math.min(129, workingPoints.length));
      const finalPoints = sampleFittedEllipseLoop(
        animationTargets[0],
        closedFit,
        winding,
        targetCount,
      );
      return padTail({ animationTargets, finalPoints });
    }
  } else if (!isClosed && corners.length === 0) {
    const arcResult = tryBuildOpenCircularArc(workingPoints);
    if (arcResult) {
      return arcResult;
    }
  }

  // Step 5: Fallback smooth-by-segments for mixed curves (e.g. D-shape, S-curve)
  const smoothed = smoothBySegments(workingPoints, corners, isClosed);
  return padTail({ animationTargets: smoothed, finalPoints: smoothed });
};
