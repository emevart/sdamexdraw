import React from "react";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import {
  act,
  fireEvent,
  GlobalTestState,
  render,
  unmountComponent,
} from "./test-utils";

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

// touchType is an iOS-only field on Touch: "direct" for fingers, "stylus" for
// the Apple Pencil when it arrives through the TouchEvent stream. jsdom does not
// synthesise it, so we attach it directly to the touch objects we fire.
const directTouch = (identifier: number, clientX: number, clientY: number) =>
  ({ identifier, clientX, clientY, touchType: "direct" } as unknown as Touch);
const stylusTouch = (identifier: number, clientX: number, clientY: number) =>
  ({ identifier, clientX, clientY, touchType: "stylus" } as unknown as Touch);

const fireTwoFingerTap = (touches: Touch[]) => {
  const canvas = GlobalTestState.interactiveCanvas;
  fireEvent.touchStart(canvas, { touches, changedTouches: touches });
  fireEvent.touchEnd(canvas, { touches: [], changedTouches: touches });
};

const liveElementCount = () => h.elements.filter((el) => !el.isDeleted).length;

// Draws a rectangle through the real pointer flow so it lands on the undo
// stack. UI.createElement / UI.clickTool need the desktop toolbar buttons,
// which do not render in this jsdom harness, so we select the tool via the App
// API (as the other suites in this file do) and drag with the mouse.
const mouse = new Pointer("mouse", 30);
const drawRectangle = () => {
  act(() => {
    h.app.setActiveTool({ type: "rectangle" });
  });
  mouse.reset();
  mouse.down(10, 10);
  mouse.reset();
  mouse.up(60, 60);
};

describe("tablet input policy: two-finger double-tap undo hardening", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
  });

  it("two direct-finger double tap undoes", async () => {
    drawRectangle();
    expect(liveElementCount()).toBe(1);

    fireTwoFingerTap([directTouch(1, 100, 100), directTouch(2, 160, 100)]);
    fireTwoFingerTap([directTouch(3, 100, 100), directTouch(4, 160, 100)]);

    expect(liveElementCount()).toBe(0);
  });

  it("finger + stylus touch does not undo", async () => {
    drawRectangle();
    expect(liveElementCount()).toBe(1);

    fireTwoFingerTap([directTouch(1, 100, 100), stylusTouch(2, 160, 100)]);
    fireTwoFingerTap([directTouch(3, 100, 100), stylusTouch(4, 160, 100)]);

    expect(liveElementCount()).toBe(1);
  });

  it("two fingers while pen is on the surface do not undo (palm + finger)", async () => {
    drawRectangle();
    expect(liveElementCount()).toBe(1);
    pen.downAt(400, 400);

    fireTwoFingerTap([directTouch(1, 100, 100), directTouch(2, 160, 100)]);
    fireTwoFingerTap([directTouch(3, 100, 100), directTouch(4, 160, 100)]);

    pen.upAt(400, 400);
    expect(liveElementCount()).toBe(1);
  });
});

describe("tablet input policy: pen-mode static finger tap clears selection (#2571)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    API.setAppState({ penMode: true, penDetected: true });
  });

  const selectRectangle = () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);
    selectTool("selection");
    expect(h.state.selectedElementIds[rect.id]).toBe(true);
    return rect;
  };

  it("static single-finger tap on empty canvas clears the selection", async () => {
    const rect = selectRectangle();

    finger1.downAt(400, 400); // empty canvas, far from the element
    finger1.upAt(400, 400);

    expect(h.state.selectedElementIds[rect.id]).toBeUndefined();
    expect(Object.keys(h.state.selectedElementIds).length).toBe(0);
  });

  it("finger that pans past the tap slop keeps the selection", async () => {
    const rect = selectRectangle();

    finger1.downAt(400, 400);
    finger1.moveTo(460, 400); // 60px > tap slop -> a real pan, not a tap
    finger1.upAt(460, 400);

    expect(h.state.selectedElementIds[rect.id]).toBe(true);
  });

  it("finger stays inert while a pen is on the surface, so it cannot deselect (palm rejection)", async () => {
    selectRectangle();
    const scrollXBefore = h.state.scrollX;

    // Pen rests on the selected element -> touch is inert (palm rejection). A
    // finger contact (even a moving one that would otherwise pan) must be
    // ignored entirely.
    pen.downAt(150, 150);
    finger1.downAt(400, 400);
    finger1.moveTo(300, 400); // a live finger would pan here
    finger1.upAt(300, 400);

    // The finger never drove the camera: the tap-to-deselect logic lives inside
    // the pen-mode finger-pan session, which is never created while a pen is on
    // the surface, so it can never clear the selection here.
    expect(h.state.scrollX).toBe(scrollXBefore);

    pen.upAt(150, 150); // cleanup
  });

  it("two-finger tap does not clear the selection via the tap-to-deselect path", async () => {
    const rect = selectRectangle();

    finger1.downAt(300, 300);
    finger2.downAt(360, 300); // second contact cancels the tap candidate
    finger1.upAt(300, 300);
    finger2.upAt(360, 300);

    expect(h.state.selectedElementIds[rect.id]).toBe(true);
  });

  it("static single-finger tap on an element keeps the selection (not empty canvas)", async () => {
    const rect = selectRectangle();

    finger1.downAt(150, 150); // on the element (scene 150,150 is inside 100..200)
    finger1.upAt(150, 150);

    expect(h.state.selectedElementIds[rect.id]).toBe(true);
  });
});

describe("tablet input policy: finger drags the selection in pen mode (#2598)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    API.setAppState({ penMode: true, penDetected: true });
  });

  const selectRectangle = () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);
    selectTool("selection");
    expect(h.state.selectedElementIds[rect.id]).toBe(true);
    return rect;
  };

  it("finger starting on the selection drags it instead of panning", async () => {
    const rect = selectRectangle();
    const scrollXBefore = h.state.scrollX;
    const xBefore = h.elements[0].x; // mutateElement mutates in place

    finger1.downAt(150, 150); // inside the selected bbox
    finger1.moveTo(250, 150);
    finger1.upAt(250, 150);

    expect(h.elements[0].x).toBeGreaterThan(xBefore); // dragged
    expect(h.state.scrollX).toBe(scrollXBefore); // no pan
    expect(h.state.selectedElementIds[rect.id]).toBe(true);
  });

  it("finger starting outside the selection still pans and keeps the selection", async () => {
    const rect = selectRectangle();
    const xBefore = h.elements[0].x;
    const scrollXBefore = h.state.scrollX;

    finger1.downAt(400, 400); // empty canvas, outside the selected bbox
    finger1.moveTo(500, 400);
    finger1.upAt(500, 400);

    expect(h.elements[0].x).toBe(xBefore);
    expect(h.state.scrollX).not.toBe(scrollXBefore);
    expect(h.state.selectedElementIds[rect.id]).toBe(true); // moved past slop -> no tap-deselect
  });

  it("finger on a NON-selected element still pans (no selection present)", async () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    selectTool("selection");
    const scrollXBefore = h.state.scrollX;

    finger1.downAt(150, 150);
    finger1.moveTo(250, 150);
    finger1.upAt(250, 150);

    expect(h.elements[0].x).toBe(rect.x);
    expect(h.state.scrollX).not.toBe(scrollXBefore);
  });

  it("pen on the surface keeps touch inert even over the selection", async () => {
    const rect = selectRectangle();
    const scrollXBefore = h.state.scrollX;

    pen.downAt(400, 400);
    finger1.downAt(150, 150); // palm over the selection
    finger1.moveTo(250, 150);
    finger1.upAt(250, 150);
    pen.upAt(400, 400);

    expect(h.elements[0].x).toBe(rect.x); // untouched
    expect(h.state.scrollX).toBe(scrollXBefore);
  });

  it("with a drawing tool active the finger over the selection is still the camera", async () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);
    selectFreedrawTool();
    const scrollXBefore = h.state.scrollX;

    finger1.downAt(150, 150);
    finger1.moveTo(250, 150);
    finger1.upAt(250, 150);

    expect(h.elements[0].x).toBe(rect.x);
    expect(freedrawElements().length).toBe(0); // did not draw
    expect(h.state.scrollX).not.toBe(scrollXBefore); // panned
  });

  it("static finger tap on the selection keeps it selected", async () => {
    const rect = selectRectangle();

    finger1.downAt(150, 150);
    finger1.upAt(150, 150);

    expect(h.state.selectedElementIds[rect.id]).toBe(true);
  });
});

describe("tablet input policy: finger tap on a locked element surfaces unlock (#2632)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    API.setAppState({ penMode: true, penDetected: true });
  });

  // Taps in this suite land on the stroke (x=100 edge): like on desktop, a
  // transparent rectangle interior is not a hit for getElementAtPosition.
  const createLockedRectangle = () =>
    API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      locked: true,
    });

  it("static finger tap on a locked element sets activeLockedId (freedraw active)", async () => {
    const rect = createLockedRectangle();
    API.setElements([rect]);
    selectFreedrawTool();

    finger1.downAt(100, 150);
    finger1.upAt(100, 150);

    expect(h.state.activeLockedId).toBe(rect.id);
    expect(freedrawElements().length).toBe(0); // the finger never draws
  });

  it("static finger tap on a locked element clears the selection and sets activeLockedId (selection tool)", async () => {
    const locked = createLockedRectangle();
    const other = API.createElement({
      type: "rectangle",
      x: 400,
      y: 400,
      width: 50,
      height: 50,
    });
    API.setElements([locked, other]);
    API.setSelectedElements([other]);
    selectTool("selection");

    finger1.downAt(100, 150); // on the locked element, outside the selection
    finger1.upAt(100, 150);

    expect(h.state.activeLockedId).toBe(locked.id);
    expect(h.state.selectedElementIds[other.id]).toBeUndefined();
  });

  it("grouped locked element resolves activeLockedId to the outermost group id", async () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      locked: true,
      groupIds: ["inner-group", "outer-group"],
    });
    API.setElements([rect]);
    selectFreedrawTool();

    finger1.downAt(100, 150);
    finger1.upAt(100, 150);

    expect(h.state.activeLockedId).toBe("outer-group");
  });

  it("sub-slop jitter still surfaces the pill (a real fingertip never lands perfectly still)", async () => {
    const rect = createLockedRectangle();
    API.setElements([rect]);
    selectFreedrawTool();

    finger1.downAt(100, 150);
    finger1.moveTo(105, 150); // 5px < PEN_MODE_TAP_SLOP_PX -> still a tap
    finger1.upAt(105, 150);

    expect(h.state.activeLockedId).toBe(rect.id);
  });

  it("sub-slop wiggle in the outer hit band: hit-test follows the finger, not the down-point", async () => {
    const rect = createLockedRectangle();
    API.setElements([rect]);
    selectFreedrawTool();

    // Down lands 12px right of the stroke centerline -- inside the ~17px hit
    // band. The 9px outward wiggle pans the camera; hit-testing the DOWN
    // coords against the panned camera would resolve ~21px off the stroke
    // and miss (the pointerup coords resolve back to the same scene spot).
    finger1.downAt(112, 150);
    finger1.moveTo(103, 150); // 9px < slop -> candidate survives, camera pans
    finger1.upAt(103, 150);

    expect(h.state.activeLockedId).toBe(rect.id);
  });

  it("a tap that travels just past the slop is a pan, not a tap on the locked element", async () => {
    const rect = createLockedRectangle();
    API.setElements([rect]);
    selectFreedrawTool();

    finger1.downAt(100, 150);
    finger1.moveTo(112, 150); // 12px > PEN_MODE_TAP_SLOP_PX -> disarmed
    finger1.upAt(112, 150);

    expect(h.state.activeLockedId).toBe(null);
  });

  it("finger that drags from a locked element pans the camera and does not set activeLockedId", async () => {
    const rect = createLockedRectangle();
    API.setElements([rect]);
    selectFreedrawTool();
    const scrollXBefore = h.state.scrollX;

    finger1.downAt(100, 150);
    finger1.moveTo(250, 150); // past the tap slop -> a real pan
    finger1.upAt(250, 150);

    expect(h.state.activeLockedId).toBe(null);
    expect(h.state.scrollX).not.toBe(scrollXBefore);
  });

  it("touch stays inert over a locked element while a pen is on the surface (palm rejection)", async () => {
    const rect = createLockedRectangle();
    API.setElements([rect]);
    selectFreedrawTool();

    pen.downAt(400, 400);
    finger1.downAt(100, 150);
    finger1.upAt(100, 150);
    pen.upAt(400, 400);

    expect(h.state.activeLockedId).toBe(null);
  });

  it("tap on empty canvas clears activeLockedId (pill goes away)", async () => {
    const rect = createLockedRectangle();
    API.setElements([rect]);
    selectFreedrawTool();

    finger1.downAt(100, 150);
    finger1.upAt(100, 150);
    expect(h.state.activeLockedId).toBe(rect.id);

    finger1.downAt(400, 400);
    finger1.upAt(400, 400);

    expect(h.state.activeLockedId).toBe(null);
  });

  it("tap on an unlocked element clears a stale activeLockedId without selecting", async () => {
    const locked = createLockedRectangle();
    const plain = API.createElement({
      type: "rectangle",
      x: 400,
      y: 400,
      width: 100,
      height: 100,
    });
    API.setElements([locked, plain]);
    selectFreedrawTool();

    finger1.downAt(100, 150);
    finger1.upAt(100, 150);
    expect(h.state.activeLockedId).toBe(locked.id);

    finger1.downAt(400, 450); // on the unlocked element
    finger1.upAt(400, 450);

    expect(h.state.activeLockedId).toBe(null);
    expect(h.state.selectedElementIds[plain.id]).toBeUndefined();
  });

  it("view mode: tap on a locked element does not surface the unlock affordance", async () => {
    const rect = createLockedRectangle();
    API.setElements([rect]);
    API.setAppState({ viewModeEnabled: true });

    finger1.downAt(100, 150);
    finger1.upAt(100, 150);

    expect(h.state.activeLockedId).toBe(null);
  });
});

describe("tablet input policy: auto pen mode (#2562)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
  });

  it("first pen contact on the canvas enables pen mode", async () => {
    expect(h.state.penMode).toBe(false);
    expect(h.state.penDetected).toBe(false);

    pen.downAt(100, 100);
    pen.upAt(100, 100);

    expect(h.state.penDetected).toBe(true);
    expect(h.state.penMode).toBe(true);
  });

  it("a finger never enables pen mode", async () => {
    finger1.downAt(100, 100);
    finger1.moveTo(150, 150);
    finger1.upAt(150, 150);

    expect(h.state.penMode).toBe(false);
    expect(h.state.penDetected).toBe(false);
  });

  it("after an explicit toggle-off the pen does not re-enable pen mode", async () => {
    pen.downAt(100, 100);
    pen.upAt(100, 100);
    expect(h.state.penMode).toBe(true);

    act(() => {
      h.app.togglePenMode(false);
    });
    expect(h.state.penMode).toBe(false);

    pen.downAt(200, 200);
    pen.upAt(200, 200);

    expect(h.state.penMode).toBe(false); // exit is only ever manual
    expect(h.state.penDetected).toBe(true);
  });
});
