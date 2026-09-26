import React from "react";

import { Excalidraw } from "../index";

import { Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

import type { ToolType } from "../types";

const { h } = window;

const mouse = new Pointer("mouse", 31);

const pick = (type: ToolType) =>
  act(() => {
    h.app.setActiveTool({ type } as Parameters<typeof h.app.setActiveTool>[0]);
  });

const stroke = (fromX: number, fromY: number, toX: number, toY: number) => {
  mouse.downAt(fromX, fromY);
  for (let i = 1; i <= 10; i++) {
    mouse.moveTo(
      fromX + ((toX - fromX) * i) / 10,
      fromY + ((toY - fromY) * i) / 10,
    );
  }
  mouse.upAt(toX, toY);
};

// sdamex #2321 (founder 26.09): the pen, the highlighter and the eraser stay
// selected after a stroke, so a student writing by hand never picks the pen
// again after every line. Shapes and text go back to selection. Upstream resets
// every tool except freedraw unless the tool lock is on; this suite guards the
// behaviour across upstream syncs.
describe("tool after a stroke (sdamex #2321)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
  });

  it("the pen stays selected", () => {
    pick("freedraw");
    stroke(100, 100, 200, 140);

    expect(h.elements.at(-1)?.type).toBe("freedraw");
    expect(h.state.activeTool.type).toBe("freedraw");
  });

  it("the eraser stays selected after erasing", () => {
    pick("freedraw");
    stroke(100, 100, 300, 100);
    const drawn = h.elements.at(-1)!;

    // A tap right on the stroke: the eraser trail of a drag is sampled on
    // animation frames, which jsdom does not run.
    pick("eraser");
    mouse.downAt(200, 100);
    mouse.upAt(200, 100);

    expect(h.elements.find((el) => el.id === drawn.id)?.isDeleted).toBe(true);
    expect(h.state.activeTool.type).toBe("eraser");
  });

  it("a shape goes back to selection", () => {
    pick("rectangle");
    stroke(100, 100, 200, 200);

    // sdamex keeps a rectangle as a closed polygon (poly preset), hence no
    // type check here
    expect(h.elements.length).toBe(1);
    expect(h.state.activeTool.type).toBe("selection");
  });
});
