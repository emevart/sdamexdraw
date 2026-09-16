import { pointFrom, pointDistance } from "@excalidraw/math";

import {
  STRAIGHTEN_DEVIATION_THRESHOLD,
  STRAIGHTEN_CLOSE_THRESHOLD,
  STRAIGHTEN_CORNER_WINDOW,
  STRAIGHTEN_CORNER_ANGLE,
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

const AUTO_CLOSE_MIN_THRESHOLD = 1;
const AUTO_CLOSE_MAX_RATIO = 0.12;

/**
 * Keep the close gesture proportional to the mark size. A fixed 30px gap
 * makes compact strokes look closed even when the user only draws a small
 * open mark.
 */
export const getAutoCloseThreshold = (
  points: readonly LocalPoint[],
): number => {
  if (points.length === 0) {
    return AUTO_CLOSE_MIN_THRESHOLD;
  }

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

  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  return Math.min(
    STRAIGHTEN_CLOSE_THRESHOLD,
    Math.max(AUTO_CLOSE_MIN_THRESHOLD, diagonal * AUTO_CLOSE_MAX_RATIO),
  );
};

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
 * Contract points to close a nearly-closed shape.
 * Ease-out falloff: start stays, end moves to start, middle shifts proportionally.
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
    const pull = t * t; // ease-out
    return pointFrom<LocalPoint>(p[0] - pull * gapX, p[1] - pull * gapY);
  });
};

/**
 * Detect corner points by measuring direction change over a window.
 * Returns sorted array of indices where corners are detected.
 */
const detectCorners = (
  points: readonly LocalPoint[],
  isClosed: boolean,
): number[] => {
  const n = points.length;
  const W = STRAIGHTEN_CORNER_WINDOW;
  const angleThreshold = (STRAIGHTEN_CORNER_ANGLE * Math.PI) / 180;
  const angles: { idx: number; angle: number }[] = [];

  for (let i = 1; i < n - 1; i++) {
    let beforeIdx: number;
    let afterIdx: number;

    if (isClosed) {
      beforeIdx = i - W < 0 ? (((i - W) % n) + n) % n : i - W;
      afterIdx = i + W >= n ? (i + W) % n : i + W;
    } else {
      beforeIdx = Math.max(0, i - W);
      afterIdx = Math.min(n - 1, i + W);
    }

    const bx = points[i][0] - points[beforeIdx][0];
    const by = points[i][1] - points[beforeIdx][1];
    const ax = points[afterIdx][0] - points[i][0];
    const ay = points[afterIdx][1] - points[i][1];

    const lenB = Math.sqrt(bx * bx + by * by);
    const lenA = Math.sqrt(ax * ax + ay * ay);

    if (lenB < 1 || lenA < 1) {
      continue;
    }

    const dot = (bx * ax + by * ay) / (lenB * lenA);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    if (angle > angleThreshold) {
      angles.push({ idx: i, angle });
    }
  }

  // Non-maximum suppression: keep only the strongest corner in each window
  const corners: number[] = [];
  for (const candidate of angles) {
    const dominated = angles.some(
      (other) =>
        other !== candidate &&
        Math.abs(other.idx - candidate.idx) <= W &&
        other.angle > candidate.angle,
    );
    if (!dominated) {
      corners.push(candidate.idx);
    }
  }

  return corners.sort((a, b) => a - b);
};

/**
 * Smooth points with cyclic wrapping (for closed shapes).
 * Points near start/end average across the seam.
 * Preserves point count. Does NOT preserve endpoints separately.
 */
const smoothPointsCyclic = (
  points: readonly LocalPoint[],
  radius: number = 3,
): LocalPoint[] => {
  const n = points.length;
  if (n <= 2) {
    return [...points];
  }

  const result: LocalPoint[] = new Array(n);

  for (let i = 0; i < n; i++) {
    let sumX = 0;
    let sumY = 0;
    let totalWeight = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const j = (((i + offset) % n) + n) % n;
      const w = 1 / (1 + Math.abs(offset));
      sumX += points[j][0] * w;
      sumY += points[j][1] * w;
      totalWeight += w;
    }
    result[i] = pointFrom<LocalPoint>(sumX / totalWeight, sumY / totalWeight);
  }

  // Re-close: ensure last point equals first
  result[n - 1] = result[0];
  return result;
};

/**
 * Smooth points segment-by-segment, preserving corner points.
 * For closed shapes with no corners near the seam, uses cyclic smoothing.
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
  const boundaries = [0, ...corners, points.length - 1];

  for (let s = 0; s < boundaries.length - 1; s++) {
    const segStart = boundaries[s];
    const segEnd = boundaries[s + 1];
    const segLen = segEnd - segStart + 1;

    if (segLen <= 2) {
      continue;
    }

    // Per-segment decision: straighten if nearly straight, smooth if curved
    const segment = points.slice(segStart, segEnd + 1);
    const sp = points[segStart];
    const ep = points[segEnd];
    const segLineLen = pointDistance(sp, ep);
    const segDeviation = maxDeviationFromLine(segment);

    if (
      segLineLen > 1 &&
      segDeviation / segLineLen < STRAIGHTEN_DEVIATION_THRESHOLD
    ) {
      // Segment is nearly straight → project onto line
      const dx = ep[0] - sp[0];
      const dy = ep[1] - sp[1];
      const lenSq = dx * dx + dy * dy;

      for (let i = 1; i < segLen - 1; i++) {
        const p = points[segStart + i];
        const t =
          lenSq > 0
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((p[0] - sp[0]) * dx + (p[1] - sp[1]) * dy) / lenSq,
                ),
              )
            : 0;
        result[segStart + i] = pointFrom<LocalPoint>(
          sp[0] + dx * t,
          sp[1] + dy * t,
        );
      }
    } else {
      // Segment is curved → smooth it
      const smoothed = smoothPoints(segment, radius);
      for (let i = 1; i < smoothed.length - 1; i++) {
        result[segStart + i] = smoothed[i];
      }
    }
  }

  // For closed shapes: handle the seam segment (last corner → 0 → first corner)
  if (isClosed && corners.length >= 2) {
    const n = points.length;
    const lastCorner = corners[corners.length - 1];
    const firstCorner = corners[0];
    const seamStart = result[lastCorner];
    const seamEnd = result[firstCorner];
    const seamLineLen = pointDistance(seamStart, seamEnd);

    // Collect seam points for deviation check
    const seamPts: LocalPoint[] = [seamStart];
    const seamCount = n - 1 - lastCorner + firstCorner;
    for (let k = 1; k < seamCount; k++) {
      const idx = (lastCorner + k) % n;
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
      // Seam is straight → project
      const sdx = seamEnd[0] - seamStart[0];
      const sdy = seamEnd[1] - seamStart[1];
      const sLenSq = sdx * sdx + sdy * sdy;
      for (let k = 1; k < seamCount; k++) {
        const idx = (lastCorner + k) % n;
        if (idx === firstCorner) {
          break;
        }
        const t = sLenSq > 0 ? Math.max(0, Math.min(1, k / seamCount)) : 0;
        result[idx] = pointFrom<LocalPoint>(
          seamStart[0] + sdx * t,
          seamStart[1] + sdy * t,
        );
      }
    } else {
      // Seam is curved → smooth with cyclic averaging
      for (let k = 1; k < seamCount; k++) {
        const idx = (lastCorner + k) % n;
        if (idx === firstCorner) {
          break;
        }
        let sumX = 0;
        let sumY = 0;
        let totalWeight = 0;
        for (let j = -radius; j <= radius; j++) {
          const neighbor = (((idx + j) % n) + n) % n;
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

export type StraightenResult = {
  /** Same length as original points — used for per-point animation */
  animationTargets: LocalPoint[];
  /** Final points to set on the element (may be fewer) */
  finalPoints: LocalPoint[];
};

/**
 * Compute straightening targets for a freedraw stroke.
 *
 * Flow:
 * 1. If gap < a size-relative threshold → contract to close (ease-out pull)
 * 2. If open and low deviation → straighten to line
 * 3. Otherwise → detect corners, smooth segments between them
 */
export const computeStraightenResult = (
  points: readonly LocalPoint[],
): StraightenResult | null => {
  if (points.length < 2) {
    return null;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const gapDist = pointDistance(start, end);
  const totalLen = pathLength(points);
  const closeThreshold = getAutoCloseThreshold(points);

  // Step 1: Closure detection — contract if gap is small
  let isClosed = false;
  let workingPoints: LocalPoint[];

  if (gapDist < closeThreshold && totalLen > STRAIGHTEN_CLOSE_THRESHOLD * 3) {
    workingPoints = contractToClose(points);
    isClosed = true;
  } else {
    workingPoints = [...points] as LocalPoint[];
  }

  // Step 2: Straight line check (skip for closed shapes)
  if (!isClosed) {
    const lineLen = pointDistance(
      workingPoints[0],
      workingPoints[workingPoints.length - 1],
    );
    if (lineLen < 1) {
      return null; // degenerate
    }
    const deviation = maxDeviationFromLine(workingPoints);
    if (deviation / lineLen < STRAIGHTEN_DEVIATION_THRESHOLD) {
      const s = workingPoints[0];
      const e = workingPoints[workingPoints.length - 1];
      const dx = e[0] - s[0];
      const dy = e[1] - s[1];
      const lenSq = dx * dx + dy * dy;

      const animationTargets = workingPoints.map((p) => {
        const t = Math.max(
          0,
          Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / lenSq),
        );
        return pointFrom<LocalPoint>(s[0] + dx * t, s[1] + dy * t);
      });

      return { animationTargets, finalPoints: animationTargets };
    }
  }

  // Step 3: Smart smoothing with corner detection
  let corners = detectCorners(workingPoints, isClosed);
  // Density filter: if too many corners, it's a smooth curve, not a polygon
  if (corners.length > workingPoints.length * 0.3) {
    corners = [];
  }
  const smoothed = smoothBySegments(workingPoints, corners, isClosed);

  return { animationTargets: smoothed, finalPoints: smoothed };
};
