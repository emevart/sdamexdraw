import { arrayToMap } from "@excalidraw/common";

import type { EditorInterface } from "@excalidraw/common";

import { newElement } from "../src/newElement";
import {
  getOmitSidesForEditorInterface,
  getTransformHandles,
} from "../src/transformHandles";

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
