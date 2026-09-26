import React from "react";

import { getFreeDrawCenterlineSvgPath } from "@excalidraw/element";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse", 33);

const lastStroke = () => {
  const element = h.elements.at(-1)!;
  expect(element.type).toBe("freedraw");
  return element as ExcalidrawFreeDrawElement;
};

// Length of the path between its first and last coordinates.
const pathSpan = (d: string) => {
  const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [x0, y0] = numbers;
  const [x1, y1] = numbers.slice(-2);
  return Math.hypot(x1 - x0, y1 - y0);
};

// sdamex review 0.30.6: the dashed pen is checked on real gestures. A click
// moves the pointerup point by 0.0001 (App), and releasing near the start
// closes the stroke (actionFinalize puts the first point last).
describe("dashed pen on real gestures (sdamex)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    API.setAppState({ currentItemStrokeStyle: "dotted" });
  });

  it("a click draws a visible dot", () => {
    mouse.downAt(100, 100);
    mouse.moveTo(100, 100);
    mouse.upAt(100, 100);

    const stroke = lastStroke();
    expect(stroke.strokeStyle).toBe("dotted");
    const d = getFreeDrawCenterlineSvgPath(stroke);
    // a zero-length path paints nothing with round caps
    expect(pathSpan(d)).toBeGreaterThan(0);
  });

  it("a closed stroke keeps its whole outline, not a dot", () => {
    const steps = 24;
    mouse.downAt(200, 100);
    for (let i = 1; i <= steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      mouse.moveTo(150 + 50 * Math.cos(angle), 100 + 50 * Math.sin(angle));
    }
    mouse.upAt(200, 100);

    const stroke = lastStroke();
    const [first, last] = [stroke.points[0], stroke.points.at(-1)!];
    expect(last).toEqual(first);
    const d = getFreeDrawCenterlineSvgPath(stroke);
    expect(d).toContain("Q");
    expect(d.split("Q").length).toBeGreaterThan(5);
  });
});
