import React from "react";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

// window test handle, same pattern as regressionTests.test.tsx
const { h } = window;

const finger1 = new Pointer("touch", 11);
const finger2 = new Pointer("touch", 12);
const palm = new Pointer("touch", 13);
const pen = new Pointer("pen", 14);

const freedrawElements = () =>
  h.elements.filter(
    (el): el is ExcalidrawFreeDrawElement =>
      el.type === "freedraw" && !el.isDeleted,
  );

// Selecting the tool via the App API is equivalent to clicking the toolbar
// button (which is what setActiveTool ultimately backs) but does not depend on
// the desktop toolbar being laid out in the jsdom render.
const selectTool = (type: "freedraw" | "selection") => {
  act(() => {
    h.app.setActiveTool({ type });
  });
};

const selectFreedrawTool = () => selectTool("freedraw");

describe("tablet input policy: palm rejection (pen contact makes touch inert)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
  });

  it("palm-first: pen starts a stroke and canvas does not pan (palm+pen is not a gesture)", async () => {
    selectFreedrawTool();
    API.setAppState({ penMode: true, penDetected: true });
    const scrollXBefore = h.state.scrollX;
    const scrollYBefore = h.state.scrollY;

    palm.downAt(300, 400); // palm lands FIRST
    pen.downAt(100, 100);
    pen.moveTo(140, 140);
    pen.moveTo(180, 180);
    pen.upAt(180, 180);
    palm.upAt(300, 400);

    expect(freedrawElements().length).toBe(1);
    expect(freedrawElements()[0].points.length).toBeGreaterThan(1);
    expect(h.state.scrollX).toBe(scrollXBefore);
    expect(h.state.scrollY).toBe(scrollYBefore);
  });

  it("palm mid-stroke: stroke survives, is not discarded and not finalized early", async () => {
    selectFreedrawTool();
    API.setAppState({ penMode: true, penDetected: true });

    pen.downAt(100, 100);
    pen.moveTo(120, 120);
    pen.moveTo(140, 140);
    palm.downAt(320, 420); // palm lands DURING the stroke
    pen.moveTo(160, 160);
    pen.moveTo(180, 180);
    pen.upAt(180, 180);
    palm.upAt(320, 420);

    expect(freedrawElements().length).toBe(1);
    // Both pre-palm and post-palm points made it into the same stroke.
    expect(freedrawElements()[0].points.length).toBeGreaterThanOrEqual(4);
  });

  it("pen lift releases the touch lock: two fingers pinch-zoom again", async () => {
    API.setAppState({ penMode: true, penDetected: true });
    pen.downAt(100, 100);
    pen.upAt(100, 100);

    const zoomBefore = h.state.zoom.value;
    finger1.downAt(200, 300);
    finger2.downAt(400, 300);
    finger1.moveTo(150, 300);
    finger2.moveTo(450, 300); // spread -> zoom in
    finger1.upAt(150, 300);
    finger2.upAt(450, 300);

    expect(h.state.zoom.value).not.toBe(zoomBefore);
  });

  it("pen never joins the gesture: pen+finger never zooms", async () => {
    API.setAppState({ penMode: true, penDetected: true });
    const zoomBefore = h.state.zoom.value;

    pen.downAt(100, 100);
    finger1.downAt(300, 300); // inert (pen on surface)
    pen.moveTo(200, 200);
    finger1.moveTo(350, 350);
    pen.upAt(200, 200);
    finger1.upAt(350, 350);

    expect(h.state.zoom.value).toBe(zoomBefore);
  });
});

describe("tablet input policy: finger is the camera in pen mode", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    API.setAppState({ penMode: true, penDetected: true });
  });

  it("single finger pans instead of drawing (freedraw tool active)", async () => {
    selectFreedrawTool();
    const scrollXBefore = h.state.scrollX;

    finger1.downAt(200, 200);
    finger1.moveTo(300, 200);
    finger1.upAt(300, 200);

    expect(freedrawElements().length).toBe(0);
    expect(h.state.scrollX).not.toBe(scrollXBefore);
  });

  it("single finger does not select or drag elements in pen mode", async () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    selectTool("selection");
    const xBefore = rect.x;

    finger1.downAt(150, 150); // on the element
    finger1.moveTo(250, 150);
    finger1.upAt(250, 150);

    expect(h.elements[0].x).toBe(xBefore); // panned, not dragged
    expect(h.state.selectedElementIds[rect.id]).toBeUndefined();
  });

  it("pinch-zoom works in pen mode with freedraw active (zoom no longer suppressed)", async () => {
    selectFreedrawTool();
    const zoomBefore = h.state.zoom.value;

    finger1.downAt(200, 300);
    finger2.downAt(400, 300);
    finger1.moveTo(150, 300);
    finger2.moveTo(450, 300);
    finger1.upAt(150, 300);
    finger2.upAt(450, 300);

    expect(h.state.zoom.value).toBeGreaterThan(zoomBefore);
    expect(freedrawElements().length).toBe(0);
  });

  it("pan -> second finger joins -> pinch -> finger lifts -> pan continues without crash", async () => {
    selectFreedrawTool();

    finger1.downAt(200, 200);
    finger1.moveTo(250, 200); // one-finger pan engaged
    finger2.downAt(400, 200); // pinch arms
    finger1.moveTo(150, 200);
    finger2.moveTo(450, 200); // spread -> zoom
    const zoomAfterPinch = h.state.zoom.value;
    finger2.upAt(450, 200); // back to one finger
    finger1.moveTo(100, 200); // pan continues
    finger1.upAt(100, 200);

    expect(zoomAfterPinch).not.toBe(1);
    expect(freedrawElements().length).toBe(0);
  });

  it("mouse behaviour unchanged: left-drag draws with freedraw even in pen mode", async () => {
    selectFreedrawTool();
    const mouse = new Pointer("mouse", 21);
    mouse.downAt(100, 100);
    mouse.moveTo(150, 150);
    mouse.upAt(150, 150);
    expect(freedrawElements().length).toBe(1);
  });
});
