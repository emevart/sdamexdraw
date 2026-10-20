// sdamex billion-dollars#6066 (F3): appending points to a pen stroke while it
// is being drawn, in time that does not depend on the length of the stroke.
//
// The move handler appended with `points: [...points, ...appended]` through
// `mutateElement`: a copy of all points and pressures, then
// `getSizeFromPoints` over all points (two more arrays and a spread into
// Math.max/min, which also overflows the stack past ~100k points). That is
// O(length) per frame and O(length^2) per stroke.
//
// Here the stroke owns its arrays: the first append copies them once, later
// appends push into the same arrays and extend the size from the new points
// only. The element still changes like after `mutateElement`: version,
// versionNonce and `updated` are bumped and its cached shape and canvas are
// dropped. Caches that compare `points` by identity (ink, background) are
// dropped with the shape (`ShapeCache.delete`). Anything that replaces the
// points (straightening, transform, pointerup, undo) puts a new array on the
// element, and the next append copies it again.
//
// Copies of the element (store snapshots, history, duplicates) are deep and
// never share the owned arrays.

import type { LocalPoint } from "@excalidraw/math";

import type { Mutable } from "@excalidraw/common/utility-types";

import { bumpVersion } from "./mutateElement";
import { ShapeCache } from "./shape";

import type { ExcalidrawFreeDrawElement } from "./types";

type StrokeArrays = {
  points: LocalPoint[];
  pressures: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const owned = new WeakMap<ExcalidrawFreeDrawElement, StrokeArrays>();

const own = (element: ExcalidrawFreeDrawElement): StrokeArrays => {
  const current = owned.get(element);
  if (
    current &&
    current.points === element.points &&
    current.pressures === element.pressures
  ) {
    return current;
  }
  const points = element.points.slice();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point[0] < minX) {
      minX = point[0];
    }
    if (point[0] > maxX) {
      maxX = point[0];
    }
    if (point[1] < minY) {
      minY = point[1];
    }
    if (point[1] > maxY) {
      maxY = point[1];
    }
  }
  const next: StrokeArrays = {
    points,
    pressures: element.pressures.slice(),
    minX,
    minY,
    maxX,
    maxY,
  };
  owned.set(element, next);
  return next;
};

/**
 * Appends points (and, unless the stroke simulates pressure, their
 * pressures) to a freedraw element being drawn. O(appended) except for the
 * first call on an element or after its points were replaced (one copy).
 * Does not trigger a render: the caller updates the state, as after
 * `scene.mutateElement(..., { informMutation: false })`.
 */
export const appendFreedrawPoints = (
  element: ExcalidrawFreeDrawElement,
  points: readonly LocalPoint[],
  pressures: readonly number[],
): ExcalidrawFreeDrawElement => {
  if (!points.length) {
    return element;
  }
  const arrays = own(element);
  for (const point of points) {
    arrays.points.push(point);
    if (point[0] < arrays.minX) {
      arrays.minX = point[0];
    }
    if (point[0] > arrays.maxX) {
      arrays.maxX = point[0];
    }
    if (point[1] < arrays.minY) {
      arrays.minY = point[1];
    }
    if (point[1] > arrays.maxY) {
      arrays.maxY = point[1];
    }
  }
  if (!element.simulatePressure) {
    for (const pressure of pressures) {
      arrays.pressures.push(pressure);
    }
  }

  const mutable = element as Mutable<ExcalidrawFreeDrawElement>;
  mutable.points = arrays.points;
  mutable.pressures = arrays.pressures;
  mutable.width = arrays.maxX - arrays.minX;
  mutable.height = arrays.maxY - arrays.minY;

  ShapeCache.delete(element);
  bumpVersion(mutable);
  return element;
};
