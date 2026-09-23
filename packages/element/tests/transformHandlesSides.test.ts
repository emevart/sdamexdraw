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

  it("a tablet keeps corners only and resizes from the side band", () => {
    const handles = handlesFor(editorInterface("tablet", true));

    expect(handles.n).toBeUndefined();
    expect(handles.e).toBeUndefined();
    expect(handles.nw).toBeDefined();
  });

  it("a phone keeps its side handles", () => {
    expect(handlesFor(editorInterface("phone", true)).n).toBeDefined();
  });
});
