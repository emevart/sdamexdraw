import React from "react";
import { vi } from "vitest";

import { arrayToMap, reseed } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  newElementWith,
  Scene,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type {
  NonDeletedElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";
import * as StaticScene from "../renderer/staticScene";
import {
  isSameStaticContent,
  Renderer,
  snapshotStaticContent,
} from "../scene/Renderer";

import { API } from "./helpers/api";
import {
  act,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  unmountComponent,
} from "./test-utils";

import type { NormalizedZoomValue } from "../types";

const { h } = window;

const renderStaticScene = vi.spyOn(StaticScene, "renderStaticScene");

const toMap = (elements: readonly NonDeletedExcalidrawElement[]) =>
  arrayToMap(elements) as NonDeletedElementsMap;

describe("static canvas repaint (sdamex)", () => {
  // jsdom reports a 0 x 0 viewport, where no element is visible;
  // `mockBoundingClientRect()` makes it 200 x 100
  beforeAll(() => {
    mockBoundingClientRect();
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    await render(<Excalidraw />);
  });

  const setupScene = () => {
    const onScreen = API.createElement({
      type: "rectangle",
      id: "on-screen",
      x: 10,
      y: 10,
      width: 50,
    });
    const offScreen = API.createElement({
      type: "rectangle",
      id: "off-screen",
      x: 20000,
      y: 20000,
      width: 50,
    });
    API.setElements([onScreen, offScreen]);
    expect(h.app.visibleElements.map((element) => element.id)).toEqual([
      "on-screen",
    ]);
    renderStaticScene.mockClear();
    return { onScreen, offScreen };
  };

  it("keeps the static canvas when a batch changes only off-screen elements", () => {
    const { onScreen, offScreen } = setupScene();
    const visibleElementsBefore = h.app.visibleElements;

    API.setElements([
      onScreen,
      newElementWith(offScreen, { x: offScreen.x + 10 }),
    ]);

    expect(h.elements.find((element) => element.id === "off-screen")?.x).toBe(
      20010,
    );
    // the App did re-render: it recomputed the visible elements
    expect(h.app.visibleElements).not.toBe(visibleElementsBefore);
    expect(renderStaticScene).not.toHaveBeenCalled();
  });

  it("repaints when a visible element changes", () => {
    const { onScreen, offScreen } = setupScene();

    API.setElements([newElementWith(onScreen, { x: 20 }), offScreen]);

    expect(renderStaticScene).toHaveBeenCalled();
  });

  // e.g. SdamEx's live peer stroke preview: a new object on every frame with
  // constant version and versionNonce, passed through `updateScene`
  it("repaints when a visible element is replaced by a new object with the same version", () => {
    const { onScreen, offScreen } = setupScene();
    const replaced = { ...onScreen, width: 80 };

    API.updateScene({
      elements: [replaced, offScreen],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    const current = h.elements.find((element) => element.id === "on-screen");
    expect(current).toBe(replaced);
    expect(current?.version).toBe(onScreen.version);
    expect(current?.versionNonce).toBe(onScreen.versionNonce);
    expect(renderStaticScene).toHaveBeenCalled();
  });

  it("keeps the static canvas when an off-screen element is replaced by a new object with the same version", () => {
    const { onScreen, offScreen } = setupScene();
    const visibleElementsBefore = h.app.visibleElements;
    const replaced = { ...offScreen, width: 80 };

    API.updateScene({
      elements: [onScreen, replaced],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    expect(h.elements.find((element) => element.id === "off-screen")).toBe(
      replaced,
    );
    // the App did re-render: it recomputed the visible elements
    expect(h.app.visibleElements).not.toBe(visibleElementsBefore);
    expect(renderStaticScene).not.toHaveBeenCalled();
  });

  it("repaints when a visible element is mutated in place", () => {
    const { onScreen } = setupScene();

    act(() => {
      h.app.scene.mutateElement(onScreen, { x: 30 });
    });

    expect(renderStaticScene).toHaveBeenCalled();
  });

  it("repaints on an explicit scene.triggerUpdate()", () => {
    setupScene();

    act(() => {
      h.app.scene.triggerUpdate();
    });

    expect(renderStaticScene).toHaveBeenCalled();
  });

  it("repaints the arrow label hole while the label is edited", () => {
    const arrow = API.createElement({
      type: "arrow",
      id: "arrow",
      x: 10,
      y: 50,
      width: 150,
      height: 0,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(150, 0)],
      boundElements: [{ type: "text", id: "arrow-label" }],
    });
    const label = API.createElement({
      type: "text",
      id: "arrow-label",
      text: "a",
      containerId: arrow.id,
      x: 80,
      y: 40,
      width: 10,
      height: 20,
    });
    API.setElements([arrow, label]);
    // the label being edited leaves the renderable map, the arrow still
    // punches its hole from the full scene map
    API.setAppState({ editingTextElement: label });
    expect(h.app.visibleElements.map((element) => element.id)).toEqual([
      "arrow",
    ]);
    renderStaticScene.mockClear();

    API.setElements([arrow, newElementWith(label, { text: "abc", width: 30 })]);

    expect(renderStaticScene).toHaveBeenCalled();
  });
});

describe("static content snapshot (sdamex)", () => {
  it("treats equal ids, order, versions and frames as the same content", () => {
    const a = API.createElement({ type: "rectangle", id: "a" });
    const b = API.createElement({ type: "rectangle", id: "b", x: 200 });
    const map = toMap([a, b]);
    const snapshot = snapshotStaticContent([a, b], map, map, 0);

    expect(isSameStaticContent(snapshot, [a, b], map, map, 0)).toBe(true);
  });

  it("detects a z-order swap", () => {
    const a = API.createElement({ type: "rectangle", id: "a" });
    const b = API.createElement({ type: "rectangle", id: "b", x: 200 });
    const map = toMap([a, b]);
    const snapshot = snapshotStaticContent([a, b], map, map, 0);

    expect(isSameStaticContent(snapshot, [b, a], map, map, 0)).toBe(false);
  });

  it("detects a version change and a forced update", () => {
    const a = API.createElement({ type: "rectangle", id: "a" });
    const map = toMap([a]);
    const snapshot = snapshotStaticContent([a], map, map, 0);
    const changed = newElementWith(a, { x: 5 });
    const changedMap = toMap([changed]);

    expect(
      isSameStaticContent(snapshot, [changed], changedMap, changedMap, 0),
    ).toBe(false);
    expect(isSameStaticContent(snapshot, [a], map, map, 1)).toBe(false);
  });

  it("detects a change of the frame that contains a visible element", () => {
    const frame = API.createElement({
      type: "frame",
      id: "frame",
      x: -5000,
    });
    const child = API.createElement({
      type: "rectangle",
      id: "child",
      frameId: frame.id,
    });
    const map = toMap([frame, child]);
    const snapshot = snapshotStaticContent([child], map, map, 0);
    const movedFrame = newElementWith(frame, { x: -4000 });
    const movedMap = toMap([movedFrame, child]);

    expect(isSameStaticContent(snapshot, [child], movedMap, movedMap, 0)).toBe(
      false,
    );
  });

  it("detects a change of the bound text drawn with a visible container", () => {
    const container = API.createElement({
      type: "rectangle",
      id: "box",
      boundElements: [{ type: "text", id: "label" }],
    });
    const label = API.createElement({
      type: "text",
      id: "label",
      text: "old",
      containerId: container.id,
    });
    const map = toMap([container, label]);
    // the label is not in the visible list: the container draws it
    const snapshot = snapshotStaticContent([container], map, map, 0);
    const edited = newElementWith(label, { text: "new" });
    const editedMap = toMap([container, edited]);

    expect(
      isSameStaticContent(snapshot, [container], editedMap, editedMap, 0),
    ).toBe(false);
    // the label being edited is excluded from the renderable map
    expect(
      isSameStaticContent(snapshot, [container], toMap([container]), map, 0),
    ).toBe(false);
  });

  it("detects a change of an arrow label that is only in the full scene map", () => {
    const arrow = API.createElement({
      type: "arrow",
      id: "arrow",
      boundElements: [{ type: "text", id: "arrow-label" }],
    });
    const label = API.createElement({
      type: "text",
      id: "arrow-label",
      text: "a",
      containerId: arrow.id,
    });
    // the label being edited is excluded from the renderable map, but the
    // arrow punches its label hole from the full scene map
    const renderMap = toMap([arrow]);
    // one Map instance: the compare must not depend on map identity
    const allElementsMap = toMap([arrow, label]);
    const snapshot = snapshotStaticContent(
      [arrow],
      renderMap,
      allElementsMap,
      0,
    );
    allElementsMap.set(label.id, newElementWith(label, { text: "ab" }));

    expect(
      isSameStaticContent(snapshot, [arrow], renderMap, allElementsMap, 0),
    ).toBe(false);
  });

  // a host may pass a new object without bumping the version (e.g. SdamEx's
  // live peer stroke preview): identity counts as a change
  it("detects a visible element replaced by a new object with equal fields", () => {
    const a = API.createElement({ type: "rectangle", id: "a" });
    const map = toMap([a]);
    const snapshot = snapshotStaticContent([a], map, map, 0);
    const replaced = { ...a, width: a.width + 10 };
    const replacedMap = toMap([replaced]);

    expect(
      isSameStaticContent(snapshot, [replaced], replacedMap, replacedMap, 0),
    ).toBe(false);
  });

  it("detects a containing frame replaced by a new object with equal fields", () => {
    const frame = API.createElement({
      type: "frame",
      id: "frame",
      x: -5000,
    });
    const child = API.createElement({
      type: "rectangle",
      id: "child",
      frameId: frame.id,
    });
    const map = toMap([frame, child]);
    const snapshot = snapshotStaticContent([child], map, map, 0);
    const replacedMap = toMap([{ ...frame, x: -4000 }, child]);

    expect(
      isSameStaticContent(snapshot, [child], replacedMap, replacedMap, 0),
    ).toBe(false);
  });

  it("detects a container's bound text replaced by a new object with equal fields", () => {
    const container = API.createElement({
      type: "rectangle",
      id: "box",
      boundElements: [{ type: "text", id: "label" }],
    });
    const label = API.createElement({
      type: "text",
      id: "label",
      text: "old",
      containerId: container.id,
    });
    const map = toMap([container, label]);
    const snapshot = snapshotStaticContent([container], map, map, 0);
    const replacedMap = toMap([container, { ...label, text: "new" }]);

    expect(
      isSameStaticContent(snapshot, [container], replacedMap, replacedMap, 0),
    ).toBe(false);
  });

  it("detects an arrow label replaced by a new object with equal fields", () => {
    const arrow = API.createElement({
      type: "arrow",
      id: "arrow",
      boundElements: [{ type: "text", id: "arrow-label" }],
    });
    const label = API.createElement({
      type: "text",
      id: "arrow-label",
      text: "a",
      containerId: arrow.id,
    });
    // the label is only in the full scene map (being edited)
    const renderMap = toMap([arrow]);
    const allElementsMap = toMap([arrow, label]);
    const snapshot = snapshotStaticContent(
      [arrow],
      renderMap,
      allElementsMap,
      0,
    );
    allElementsMap.set(label.id, { ...label, text: "ab" });

    expect(
      isSameStaticContent(snapshot, [arrow], renderMap, allElementsMap, 0),
    ).toBe(false);
  });

  it("never reissues a static canvas nonce across renderers", () => {
    const opts = {
      zoom: { value: 1 as NormalizedZoomValue },
      offsetLeft: 0,
      offsetTop: 0,
      scrollX: 0,
      scrollY: 0,
      width: 200,
      height: 100,
      editingTextElement: null,
      newElement: null,
      selectedElements: [],
      selectedElementsAreBeingDragged: false,
      frameToHighlight: null,
    };
    // e.g. App.componentWillUnmount replaces the renderer while StaticCanvas
    // keeps its last props (StrictMode remount)
    const first = new Renderer(
      new Scene([API.createElement({ type: "rectangle", id: "a" })]),
    );
    const second = new Renderer(
      new Scene([API.createElement({ type: "rectangle", id: "b" })]),
    );

    expect(first.getRenderableElements(opts).staticCanvasNonce).not.toBe(
      second.getRenderableElements(opts).staticCanvasNonce,
    );
  });
});
