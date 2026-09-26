import {
  DEFAULT_TRANSFORM_HANDLE_SPACING,
  type EditorInterface,
} from "@excalidraw/common";

import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type { Radians } from "@excalidraw/math";

import type {
  InteractiveCanvasAppState,
  Zoom,
} from "@excalidraw/excalidraw/types";
import type { Bounds } from "@excalidraw/common";

import { getElementAbsoluteCoords } from "./bounds";
import {
  isElbowArrow,
  isFrameLikeElement,
  isImageElement,
  isLineElement,
  isLinearElement,
} from "./typeChecks";

import type {
  ElementsMap,
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  PointerType,
} from "./types";

export type TransformHandleDirection =
  | "n"
  | "s"
  | "w"
  | "e"
  | "nw"
  | "ne"
  | "sw"
  | "se";

export type TransformHandleType = TransformHandleDirection | "rotation";

export type TransformHandle = Bounds;
export type TransformHandles = Partial<{
  [T in TransformHandleType]: TransformHandle;
}>;
export type MaybeTransformHandleType = TransformHandleType | false;

const transformHandleSizes: { [k in PointerType]: number } = {
  mouse: 8,
  pen: 16,
  touch: 28,
};

const ROTATION_RESIZE_HANDLE_GAP = 16;

// sdamex: n/s/e/w handles appear only when the side is at least this long on
// screen (CSS px). 44 px is a finger-sized target: on a shorter side the middle
// handle would crowd the corners and a finger would grab the wrong one.
// Upstream used 5 mouse handles (40 px); the value is the same for rendering and
// hit testing, so a drawn handle is always hittable.
export const MIDDLE_HANDLES_MIN_SIDE_PX = 44;

export const DEFAULT_OMIT_SIDES = {
  e: true,
  s: true,
  n: true,
  w: true,
};

export const OMIT_SIDES_FOR_MULTIPLE_ELEMENTS = {
  e: true,
  s: true,
  n: true,
  w: true,
};

export const OMIT_SIDES_FOR_FRAME = {
  e: true,
  s: true,
  n: true,
  w: true,
  rotation: true,
};

const OMIT_SIDES_FOR_LINE_SLASH = {
  e: true,
  s: true,
  n: true,
  w: true,
  nw: true,
  se: true,
};

const OMIT_SIDES_FOR_LINE_BACKSLASH = {
  e: true,
  s: true,
  n: true,
  w: true,
};

const generateTransformHandle = (
  x: number,
  y: number,
  width: number,
  height: number,
  cx: number,
  cy: number,
  angle: Radians,
): TransformHandle => {
  const [xx, yy] = pointRotateRads(
    pointFrom(x + width / 2, y + height / 2),
    pointFrom(cx, cy),
    angle,
  );
  return [xx - width / 2, yy - height / 2, width, height];
};

export const canResizeFromSides = (editorInterface: EditorInterface) => {
  if (
    editorInterface.formFactor === "phone" &&
    editorInterface.userAgent.isMobileDevice
  ) {
    return false;
  }

  return true;
};

export const getOmitSidesForEditorInterface = (
  _editorInterface: EditorInterface,
) => {
  // sdamex: every device draws the n/s/e/w handles. With a mouse or trackpad
  // the invisible side band alone was hard to find (#3042); on a tablet the
  // founder asked for the same eight handles as on a computer (26.09). Tablets
  // still resize from the side band too (`canResizeFromSides`). Small shapes
  // drop the middle handles by size, see MIDDLE_HANDLES_MIN_SIDE_PX.
  return {};
};

export const getTransformHandlesFromCoords = (
  [x1, y1, x2, y2, cx, cy]: [number, number, number, number, number, number],
  angle: Radians,
  zoom: Zoom,
  pointerType: PointerType,
  omitSides: { [T in TransformHandleType]?: boolean } = {},
  margin = 4,
  spacing = DEFAULT_TRANSFORM_HANDLE_SPACING,
): TransformHandles => {
  const size = transformHandleSizes[pointerType];
  const handleWidth = size / zoom.value;
  const handleHeight = size / zoom.value;

  const handleMarginX = size / zoom.value;
  const handleMarginY = size / zoom.value;

  const width = x2 - x1;
  const height = y2 - y1;
  const dashedLineMargin = margin / zoom.value;
  const centeringOffset = (size - spacing * 2) / (2 * zoom.value);

  const transformHandles: TransformHandles = {
    nw: omitSides.nw
      ? undefined
      : generateTransformHandle(
          x1 - dashedLineMargin - handleMarginX + centeringOffset,
          y1 - dashedLineMargin - handleMarginY + centeringOffset,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
    ne: omitSides.ne
      ? undefined
      : generateTransformHandle(
          x2 + dashedLineMargin - centeringOffset,
          y1 - dashedLineMargin - handleMarginY + centeringOffset,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
    sw: omitSides.sw
      ? undefined
      : generateTransformHandle(
          x1 - dashedLineMargin - handleMarginX + centeringOffset,
          y2 + dashedLineMargin - centeringOffset,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
    se: omitSides.se
      ? undefined
      : generateTransformHandle(
          x2 + dashedLineMargin - centeringOffset,
          y2 + dashedLineMargin - centeringOffset,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
    rotation: omitSides.rotation
      ? undefined
      : generateTransformHandle(
          x1 + width / 2 - handleWidth / 2,
          y1 -
            dashedLineMargin -
            handleMarginY +
            centeringOffset -
            ROTATION_RESIZE_HANDLE_GAP / zoom.value,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
  };

  // We only want to show height handles (all cardinal directions)  above a certain size
  // sdamex: one on-screen threshold for every pointer type, see
  // MIDDLE_HANDLES_MIN_SIDE_PX.
  const minimumSizeForEightHandles = MIDDLE_HANDLES_MIN_SIDE_PX / zoom.value;
  if (Math.abs(width) > minimumSizeForEightHandles) {
    if (!omitSides.n) {
      transformHandles.n = generateTransformHandle(
        x1 + width / 2 - handleWidth / 2,
        y1 - dashedLineMargin - handleMarginY + centeringOffset,
        handleWidth,
        handleHeight,
        cx,
        cy,
        angle,
      );
    }
    if (!omitSides.s) {
      transformHandles.s = generateTransformHandle(
        x1 + width / 2 - handleWidth / 2,
        y2 + dashedLineMargin - centeringOffset,
        handleWidth,
        handleHeight,
        cx,
        cy,
        angle,
      );
    }
  }
  if (Math.abs(height) > minimumSizeForEightHandles) {
    if (!omitSides.w) {
      transformHandles.w = generateTransformHandle(
        x1 - dashedLineMargin - handleMarginX + centeringOffset,
        y1 + height / 2 - handleHeight / 2,
        handleWidth,
        handleHeight,
        cx,
        cy,
        angle,
      );
    }
    if (!omitSides.e) {
      transformHandles.e = generateTransformHandle(
        x2 + dashedLineMargin - centeringOffset,
        y1 + height / 2 - handleHeight / 2,
        handleWidth,
        handleHeight,
        cx,
        cy,
        angle,
      );
    }
  }

  return transformHandles;
};

export const getTransformHandles = (
  element: ExcalidrawElement,
  zoom: Zoom,
  elementsMap: ElementsMap,
  pointerType: PointerType = "mouse",
  omitSides: { [T in TransformHandleType]?: boolean } = DEFAULT_OMIT_SIDES,
): TransformHandles => {
  // so that when locked element is selected (especially when you toggle lock
  // via keyboard) the locked element is visually distinct, indicating
  // you can't move/resize
  if (
    element.locked ||
    // Elbow arrows cannot be rotated
    isElbowArrow(element)
  ) {
    return {};
  }

  if (element.type === "freedraw" || isLinearElement(element)) {
    if (element.points.length === 2) {
      // only check the last point because starting point is always (0,0)
      const [, p1] = element.points;
      if (p1[0] === 0 || p1[1] === 0) {
        omitSides = OMIT_SIDES_FOR_LINE_BACKSLASH;
      } else if (p1[0] > 0 && p1[1] < 0) {
        omitSides = OMIT_SIDES_FOR_LINE_SLASH;
      } else if (p1[0] > 0 && p1[1] > 0) {
        omitSides = OMIT_SIDES_FOR_LINE_BACKSLASH;
      } else if (p1[0] < 0 && p1[1] > 0) {
        omitSides = OMIT_SIDES_FOR_LINE_SLASH;
      } else if (p1[0] < 0 && p1[1] < 0) {
        omitSides = OMIT_SIDES_FOR_LINE_BACKSLASH;
      }
    }
  } else if (isFrameLikeElement(element)) {
    omitSides = {
      ...omitSides,
      rotation: true,
    };
  }
  const margin = isLinearElement(element)
    ? DEFAULT_TRANSFORM_HANDLE_SPACING + 8
    : isImageElement(element)
    ? 0
    : DEFAULT_TRANSFORM_HANDLE_SPACING;
  return getTransformHandlesFromCoords(
    getElementAbsoluteCoords(element, elementsMap, true),
    element.angle,
    zoom,
    pointerType,
    omitSides,
    margin,
    isImageElement(element) ? 0 : undefined,
  );
};

export const hasBoundingBox = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: InteractiveCanvasAppState,
  editorInterface: EditorInterface,
) => {
  if (
    appState.selectedLinearElement?.isEditing ||
    appState.selectedLinearElement?.isDragging
  ) {
    return false;
  }
  if (elements.length > 1) {
    return true;
  }
  const element = elements[0];
  if (isElbowArrow(element)) {
    // Elbow arrows cannot be resized as single selected elements
    return false;
  }
  if (!isLinearElement(element)) {
    return true;
  }

  // Poly-preset shapes (triangle, pentagon, etc.) are line elements with
  // polygon=true — they are closed shapes, not lines, so always show bbox
  if (isLineElement(element) && element.polygon) {
    return true;
  }

  // on mobile/tablet we currently don't show bbox because of resize issues
  // (also prob best for simplicity's sake)
  return element.points.length > 2 && !editorInterface.userAgent.isMobileDevice;
};
