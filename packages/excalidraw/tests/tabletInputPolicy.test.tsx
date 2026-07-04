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
const selectFreedrawTool = () => {
  act(() => {
    h.app.setActiveTool({ type: "freedraw" });
  });
};

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
