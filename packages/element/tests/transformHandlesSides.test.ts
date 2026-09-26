import { arrayToMap } from "@excalidraw/common";

import type { EditorInterface } from "@excalidraw/common";

import type { Radians } from "@excalidraw/math";

import { newElement } from "../src/newElement";
import { getTransformHandleTypeFromCoords } from "../src/resizeTest";
import {
  getOmitSidesForEditorInterface,
  getTransformHandles,
  getTransformHandlesFromCoords,
} from "../src/transformHandles";

import type { PointerType } from "../src/types";

const editorInterface = (
  formFactor: EditorInterface["formFactor"],
  isMobileDevice: boolean,
) =>
  ({
    formFactor,
    desktopUIMode: "compact",
    userAgent: { isMobileDevice, platform: "other" },
    isTouchScreen: isMobileDevice,
    canFitSidebar: true,
    isLandscape: true,
  } as EditorInterface);

const rectangle = newElement({
  type: "rectangle",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
});

const handlesFor = (target: EditorInterface) =>
  getTransformHandles(
    rectangle,
    { value: 1 } as Parameters<typeof getTransformHandles>[1],
    arrayToMap([rectangle]),
    "mouse",
    getOmitSidesForEditorInterface(target),
  );

describe("side resize handles (sdamex #3042)", () => {
  it("desktop draws n/s/e/w handles", () => {
    const handles = handlesFor(editorInterface("desktop", false));

    expect(handles.n).toBeDefined();
    expect(handles.s).toBeDefined();
    expect(handles.e).toBeDefined();
    expect(handles.w).toBeDefined();
  });

  it("a narrow laptop (tablet form factor, desktop user agent) draws them too", () => {
    expect(handlesFor(editorInterface("tablet", false)).n).toBeDefined();
  });

  it("a tablet draws the same eight handles as a computer (founder 26.09)", () => {
    const handles = handlesFor(editorInterface("tablet", true));

    expect(handles.n).toBeDefined();
    expect(handles.e).toBeDefined();
    expect(handles.nw).toBeDefined();
  });

  it("a phone keeps its side handles", () => {
    expect(handlesFor(editorInterface("phone", true)).n).toBeDefined();
  });
});

describe("middle handles on small shapes (sdamex, finger-sized target)", () => {
  const sized = (width: number, height: number, zoom = 1) => {
    const element = newElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width,
      height,
    });
    return getTransformHandles(
      element,
      { value: zoom } as Parameters<typeof getTransformHandles>[1],
      arrayToMap([element]),
      "touch",
      getOmitSidesForEditorInterface(editorInterface("tablet", true)),
    );
  };

  it("a side shorter than 44 px on screen gets no middle handle", () => {
    const handles = sized(42, 200);

    expect(handles.n).toBeUndefined();
    expect(handles.s).toBeUndefined();
    expect(handles.e).toBeDefined();
    expect(handles.nw).toBeDefined();
  });

  it("the threshold is measured on screen, so zooming in brings them back", () => {
    expect(sized(42, 42).n).toBeUndefined();
    expect(sized(42, 42, 2).n).toBeDefined();
  });
});

// A finger zone (28 px) of the middle top handle overlaps the rotation handle
// 16 px above it. Upstream checked rotation first, so a finger landing a little
// above the middle handle rotated the shape; the nearest handle wins now.
describe("touch on the middle top handle (sdamex, review 0.30.6)", () => {
  const bounds = [0, 0, 200, 100] as const;
  const tablet = editorInterface("tablet", true);
  const zoom = { value: 1 } as Parameters<typeof getTransformHandles>[1];
  const centers = (pointerType: PointerType) => {
    const handles = getTransformHandlesFromCoords(
      [...bounds, 100, 50],
      0 as Radians,
      zoom,
      pointerType,
      getOmitSidesForEditorInterface(tablet),
    );
    const center = (key: "n" | "rotation") => {
      const [x, y, w, h] = handles[key]!;
      return [x + w / 2, y + h / 2] as const;
    };
    return { n: center("n"), rotation: center("rotation") };
  };
  const hitAt = (pointerType: PointerType, x: number, y: number) =>
    getTransformHandleTypeFromCoords(
      [...bounds],
      x,
      y,
      zoom,
      pointerType,
      tablet,
    );

  it("a finger slightly above the middle handle resizes", () => {
    const { n } = centers("touch");

    expect(hitAt("touch", n[0], n[1] - 3)).toBe("n");
    expect(hitAt("touch", n[0], n[1])).toBe("n");
  });

  it("a finger on the rotation handle still rotates", () => {
    const { rotation } = centers("touch");

    expect(hitAt("touch", rotation[0], rotation[1])).toBe("rotation");
    expect(hitAt("touch", rotation[0], rotation[1] + 3)).toBe("rotation");
  });

  it("mouse zones do not overlap: the result is as upstream", () => {
    const { n, rotation } = centers("mouse");

    expect(hitAt("mouse", n[0], n[1])).toBe("n");
    expect(hitAt("mouse", rotation[0], rotation[1])).toBe("rotation");
  });
});
