import {
  pointFrom,
  pointOnLineSegment,
  pointRotateRads,
  type Radians,
} from "@excalidraw/math";

import {
  SIDE_RESIZING_THRESHOLD,
  type EditorInterface,
} from "@excalidraw/common";

import type { GlobalPoint, LineSegment, LocalPoint } from "@excalidraw/math";

import type { AppState, Zoom } from "@excalidraw/excalidraw/types";
import type { Bounds } from "@excalidraw/common";

import { getElementAbsoluteCoords } from "./bounds";
import {
  getTransformHandlesFromCoords,
  getTransformHandles,
  getOmitSidesForEditorInterface,
  canResizeFromSides,
} from "./transformHandles";
import { isImageElement, isLinearElement } from "./typeChecks";

import type {
  TransformHandleType,
  TransformHandle,
  TransformHandles,
  MaybeTransformHandleType,
} from "./transformHandles";
import type {
  ExcalidrawElement,
  PointerType,
  NonDeletedExcalidrawElement,
  ElementsMap,
} from "./types";

const isInsideTransformHandle = (
  transformHandle: TransformHandle,
  x: number,
  y: number,
) =>
  x >= transformHandle[0] &&
  x <= transformHandle[0] + transformHandle[2] &&
  y >= transformHandle[1] &&
  y <= transformHandle[1] + transformHandle[3];

// sdamex: where hit zones overlap, the handle with the nearest center wins.
// A finger zone is 28 px and the rotation handle sits 16 px above the middle
// top handle, so upstream (rotation checked first) rotated when a finger landed
// a little above that handle; tablets draw the middle handles since 0.30.6.
// Mouse and pen zones do not overlap, and on an exact tie the first handle in
// the given order wins as before.
const getNearestTransformHandleAt = (
  transformHandles: TransformHandles,
  x: number,
  y: number,
): TransformHandleType | null => {
  let nearest: TransformHandleType | null = null;
  let nearestDistance = Infinity;
  for (const [key, handle] of Object.entries(transformHandles)) {
    if (!handle || !isInsideTransformHandle(handle, x, y)) {
      continue;
    }
    const dx = x - (handle[0] + handle[2] / 2);
    const dy = y - (handle[1] + handle[3] / 2);
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = key as TransformHandleType;
      nearestDistance = distance;
    }
  }
  return nearest;
};

export const resizeTest = <Point extends GlobalPoint | LocalPoint>(
  element: NonDeletedExcalidrawElement,
  elementsMap: ElementsMap,
  appState: AppState,
  x: number,
  y: number,
  zoom: Zoom,
  pointerType: PointerType,
  editorInterface: EditorInterface,
): MaybeTransformHandleType => {
  if (!appState.selectedElementIds[element.id]) {
    return false;
  }

  const { rotation: rotationTransformHandle, ...transformHandles } =
    getTransformHandles(
      element,
      zoom,
      elementsMap,
      pointerType,
      getOmitSidesForEditorInterface(editorInterface),
    );

  // rotation first, as upstream, for an exact tie
  const hit = getNearestTransformHandleAt(
    { rotation: rotationTransformHandle, ...transformHandles },
    x,
    y,
  );
  if (hit) {
    return hit;
  }

  if (canResizeFromSides(editorInterface)) {
    const [x1, y1, x2, y2, cx, cy] = getElementAbsoluteCoords(
      element,
      elementsMap,
    );

    // do not resize from the sides for linear elements with only two points
    if (!(isLinearElement(element) && element.points.length <= 2)) {
      const SPACING = isImageElement(element)
        ? 0
        : SIDE_RESIZING_THRESHOLD / zoom.value;
      const ZOOMED_SIDE_RESIZING_THRESHOLD =
        SIDE_RESIZING_THRESHOLD / zoom.value;
      const sides = getSelectionBorders(
        pointFrom(x1 - SPACING, y1 - SPACING),
        pointFrom(x2 + SPACING, y2 + SPACING),
        pointFrom(cx, cy),
        element.angle,
      );

      for (const [dir, side] of Object.entries(sides)) {
        // test to see if x, y are on the line segment
        if (
          pointOnLineSegment(
            pointFrom(x, y),
            side as LineSegment<Point>,
            ZOOMED_SIDE_RESIZING_THRESHOLD,
          )
        ) {
          return dir as TransformHandleType;
        }
      }
    }
  }

  return false;
};

export const getElementWithTransformHandleType = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  scenePointerX: number,
  scenePointerY: number,
  zoom: Zoom,
  pointerType: PointerType,
  elementsMap: ElementsMap,
  editorInterface: EditorInterface,
) => {
  return elements.reduce((result, element) => {
    if (result) {
      return result;
    }
    const transformHandleType = resizeTest(
      element,
      elementsMap,
      appState,
      scenePointerX,
      scenePointerY,
      zoom,
      pointerType,
      editorInterface,
    );
    return transformHandleType ? { element, transformHandleType } : null;
  }, null as { element: NonDeletedExcalidrawElement; transformHandleType: MaybeTransformHandleType } | null);
};

export const getTransformHandleTypeFromCoords = <
  Point extends GlobalPoint | LocalPoint,
>(
  [x1, y1, x2, y2]: Bounds,
  scenePointerX: number,
  scenePointerY: number,
  zoom: Zoom,
  pointerType: PointerType,
  editorInterface: EditorInterface,
): MaybeTransformHandleType => {
  const transformHandles = getTransformHandlesFromCoords(
    [x1, y1, x2, y2, (x1 + x2) / 2, (y1 + y2) / 2],
    0 as Radians,
    zoom,
    pointerType,
    getOmitSidesForEditorInterface(editorInterface),
  );

  const found = getNearestTransformHandleAt(
    transformHandles,
    scenePointerX,
    scenePointerY,
  );

  if (found) {
    return found;
  }

  if (canResizeFromSides(editorInterface)) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    const SPACING = SIDE_RESIZING_THRESHOLD / zoom.value;

    const sides = getSelectionBorders(
      pointFrom(x1 - SPACING, y1 - SPACING),
      pointFrom(x2 + SPACING, y2 + SPACING),
      pointFrom(cx, cy),
      0 as Radians,
    );

    for (const [dir, side] of Object.entries(sides)) {
      // test to see if x, y are on the line segment
      if (
        pointOnLineSegment(
          pointFrom(scenePointerX, scenePointerY),
          side as LineSegment<Point>,
          SPACING,
        )
      ) {
        return dir as TransformHandleType;
      }
    }
  }

  return false;
};

const RESIZE_CURSORS = ["ns", "nesw", "ew", "nwse"];
const rotateResizeCursor = (cursor: string, angle: number) => {
  const index = RESIZE_CURSORS.indexOf(cursor);
  if (index >= 0) {
    const a = Math.round(angle / (Math.PI / 4));
    cursor = RESIZE_CURSORS[(index + a) % RESIZE_CURSORS.length];
  }
  return cursor;
};

/*
 * Returns bi-directional cursor for the element being resized
 */
export const getCursorForResizingElement = (resizingElement: {
  element?: ExcalidrawElement;
  transformHandleType: MaybeTransformHandleType;
}): string => {
  const { element, transformHandleType } = resizingElement;
  const shouldSwapCursors =
    element && Math.sign(element.height) * Math.sign(element.width) === -1;
  let cursor = null;

  switch (transformHandleType) {
    case "n":
    case "s":
      cursor = "ns";
      break;
    case "w":
    case "e":
      cursor = "ew";
      break;
    case "nw":
    case "se":
      if (shouldSwapCursors) {
        cursor = "nesw";
      } else {
        cursor = "nwse";
      }
      break;
    case "ne":
    case "sw":
      if (shouldSwapCursors) {
        cursor = "nwse";
      } else {
        cursor = "nesw";
      }
      break;
    case "rotation":
      return "grab";
  }

  if (cursor && element) {
    cursor = rotateResizeCursor(cursor, element.angle);
  }

  return cursor ? `${cursor}-resize` : "";
};

const getSelectionBorders = <Point extends LocalPoint | GlobalPoint>(
  [x1, y1]: Point,
  [x2, y2]: Point,
  center: Point,
  angle: Radians,
) => {
  const topLeft = pointRotateRads(pointFrom(x1, y1), center, angle);
  const topRight = pointRotateRads(pointFrom(x2, y1), center, angle);
  const bottomLeft = pointRotateRads(pointFrom(x1, y2), center, angle);
  const bottomRight = pointRotateRads(pointFrom(x2, y2), center, angle);

  return {
    n: [topLeft, topRight],
    e: [topRight, bottomRight],
    s: [bottomRight, bottomLeft],
    w: [bottomLeft, topLeft],
  };
};
