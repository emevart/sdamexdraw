import React from "react";
import { vi } from "vitest";

import { arrayToMap, reseed } from "@excalidraw/common";
import { newElementWith } from "@excalidraw/element";

import type {
  NonDeletedElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import * as StaticScene from "../renderer/staticScene";
import { isSameStaticContent, snapshotStaticContent } from "../scene/Renderer";

import { API } from "./helpers/api";
import {
  act,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  unmountComponent,
} from "./test-utils";

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

    API.setElements([
      onScreen,
      newElementWith(offScreen, { x: offScreen.x + 10 }),
    ]);

    expect(h.elements.find((element) => element.id === "off-screen")?.x).toBe(
      20010,
    );
    expect(renderStaticScene).not.toHaveBeenCalled();
  });

  it("repaints when a visible element changes", () => {
    const { onScreen, offScreen } = setupScene();

    API.setElements([newElementWith(onScreen, { x: 20 }), offScreen]);

    expect(renderStaticScene).toHaveBeenCalled();
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
});

describe("static content snapshot (sdamex)", () => {
  it("treats equal ids, order, versions and frames as the same content", () => {
    const a = API.createElement({ type: "rectangle", id: "a" });
    const b = API.createElement({ type: "rectangle", id: "b", x: 200 });
    const map = toMap([a, b]);
    const snapshot = snapshotStaticContent([a, b], map, 0);

    expect(isSameStaticContent(snapshot, [a, b], map, 0)).toBe(true);
  });

  it("detects a z-order swap", () => {
    const a = API.createElement({ type: "rectangle", id: "a" });
    const b = API.createElement({ type: "rectangle", id: "b", x: 200 });
    const map = toMap([a, b]);
    const snapshot = snapshotStaticContent([a, b], map, 0);

    expect(isSameStaticContent(snapshot, [b, a], map, 0)).toBe(false);
  });

  it("detects a version change and a forced update", () => {
    const a = API.createElement({ type: "rectangle", id: "a" });
    const map = toMap([a]);
    const snapshot = snapshotStaticContent([a], map, 0);
    const changed = newElementWith(a, { x: 5 });

    expect(isSameStaticContent(snapshot, [changed], toMap([changed]), 0)).toBe(
      false,
    );
    expect(isSameStaticContent(snapshot, [a], map, 1)).toBe(false);
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
    const snapshot = snapshotStaticContent([child], toMap([frame, child]), 0);
    const movedFrame = newElementWith(frame, { x: -4000 });

    expect(
      isSameStaticContent(snapshot, [child], toMap([movedFrame, child]), 0),
    ).toBe(false);
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
    // the label is not in the visible list: the container draws it
    const snapshot = snapshotStaticContent(
      [container],
      toMap([container, label]),
      0,
    );
    const edited = newElementWith(label, { text: "new" });

    expect(
      isSameStaticContent(snapshot, [container], toMap([container, edited]), 0),
    ).toBe(false);
    // the label being edited is excluded from the renderable map
    expect(
      isSameStaticContent(snapshot, [container], toMap([container]), 0),
    ).toBe(false);
  });
});
