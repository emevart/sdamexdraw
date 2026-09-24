import React from "react";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

// B's top edge ends 3px below A's top edge: object snapping pulls it to 100
const createRectangles = () => {
  const a = API.createElement({
    type: "rectangle",
    id: "snap-a",
    x: 100,
    y: 100,
    width: 100,
    height: 100,
  });
  const b = API.createElement({
    type: "rectangle",
    id: "snap-b",
    x: 300,
    y: 300,
    width: 100,
    height: 100,
    // filled, so a press inside picks it up
    backgroundColor: "#ffc9c9",
    fillStyle: "solid",
  });
  API.setElements([a, b]);
  return h.elements.find((element) => element.id === "snap-b")!;
};

const hintText = () => document.querySelector(".HintViewer")?.textContent ?? "";

describe("grid shown without grid snapping (sdamex #5176)", () => {
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    // snapping only looks at elements in the viewport
    API.setAppState({ width: 1000, height: 800 });
    mouse.reset();
  });

  it("Ctrl turns on object snapping while dragging", () => {
    createRectangles();
    API.setAppState({
      gridModeEnabled: true,
      gridSnapEnabled: false,
      gridSize: 20,
      objectsSnapModeEnabled: false,
    });

    mouse.downAt(350, 350);
    Keyboard.withModifierKeys({ ctrl: true }, () => {
      mouse.moveTo(350, 250);
      mouse.moveTo(350, 153);
    });
    mouse.upAt(350, 153);

    const b = h.elements.find((element) => element.id === "snap-b")!;
    expect(b.x).toBe(300);
    expect(b.y).toBe(100);
  });

  it("the drag hint does not offer Ctrl to disable snapping", () => {
    createRectangles();
    API.setAppState({
      gridModeEnabled: true,
      gridSnapEnabled: false,
      gridSize: 20,
    });

    mouse.downAt(350, 350);
    mouse.moveTo(350, 250);
    expect(h.state.selectedElementsAreBeingDragged).toBe(true);
    expect(hintText()).not.toContain("disable snapping");
    mouse.upAt(350, 250);
  });

  it("with grid snapping on: the hint is shown and Ctrl only disables the grid (unchanged)", () => {
    createRectangles();
    API.setAppState({
      gridModeEnabled: true,
      gridSnapEnabled: true,
      gridSize: 20,
      objectsSnapModeEnabled: false,
    });

    mouse.downAt(350, 350);
    mouse.moveTo(350, 250);
    expect(hintText()).toContain("disable snapping");
    Keyboard.withModifierKeys({ ctrl: true }, () => {
      mouse.moveTo(350, 153);
    });
    mouse.upAt(350, 153);

    const b = h.elements.find((element) => element.id === "snap-b")!;
    expect(b.y).toBe(103);
  });
});
