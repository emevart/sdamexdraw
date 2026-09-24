import React from "react";

import { KEYS } from "@excalidraw/common";
import { pointFrom } from "@excalidraw/math";

import { Excalidraw } from "@excalidraw/excalidraw";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Keyboard, Pointer } from "@excalidraw/excalidraw/tests/helpers/ui";
import {
  act,
  GlobalTestState,
  render,
  unmountComponent,
} from "@excalidraw/excalidraw/tests/test-utils";

import type { LocalPoint } from "@excalidraw/math";

import type { ExcalidrawLinearElement } from "../src/types";

const { h } = window;

const mouse = new Pointer("mouse");

// an open square: first point (200, 200), last point (200, 300)
const OPEN_SQUARE = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
].map(([x, y]) => pointFrom<LocalPoint>(x, y));

// select by clicking the top edge, then open the line editor
const enterEditor = () => {
  mouse.clickAt(250, 200);
  Keyboard.withModifierKeys({ ctrl: true }, () => {
    Keyboard.keyPress(KEYS.ENTER);
  });
  expect(h.state.selectedLinearElement?.isEditing).toBe(true);
};

const createOpenSquare = (type: "line" | "arrow") => {
  const element = API.createElement({
    type,
    x: 200,
    y: 200,
    width: 100,
    height: 100,
    roughness: 0,
    roundness: null,
    points: OPEN_SQUARE,
  }) as ExcalidrawLinearElement;
  API.setElements([element]);
  enterEditor();
  return h.elements[0] as ExcalidrawLinearElement;
};

const globalPoint = (element: ExcalidrawLinearElement, index: number) => {
  const point = element.points.at(index)!;
  return [element.x + point[0], element.y + point[1]];
};

// the close indicator is an 8px ring at the first point (see interactiveScene)
const interactiveContext = () =>
  GlobalTestState.interactiveCanvas.getContext("2d") as any;
const clearCanvasEvents = () => interactiveContext().__clearEvents();
// any canvas call since the last clear: the interactive scene was repainted
const interactiveScenePainted = () =>
  interactiveContext().__getEvents().length > 0;
const closeIndicatorDrawnAt = (x: number, y: number) =>
  interactiveContext()
    .__getEvents()
    .some(
      (event: any) =>
        event.type === "arc" &&
        event.props.radius === 8 &&
        Math.abs(event.props.x - x) < 0.01 &&
        Math.abs(event.props.y - y) < 0.01,
    );

describe("line closes when an end is dragged onto the other end (sdamex #5176)", () => {
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    h.state.width = 1000;
    h.state.height = 1000;
    mouse.reset();
  });

  it("dragging the last point within the threshold closes the line", () => {
    const line = createOpenSquare("line");

    mouse.downAt(200, 300);
    clearCanvasEvents();
    // 12.8px from the first point
    mouse.moveTo(210, 208);
    expect(closeIndicatorDrawnAt(200, 200)).toBe(true);
    mouse.upAt(210, 208);

    const updated = h.elements[0] as ExcalidrawLinearElement;
    expect(updated.id).toBe(line.id);
    expect(updated.points.length).toBe(4);
    expect(globalPoint(updated, -1)).toEqual(globalPoint(updated, 0));
    expect(globalPoint(updated, 0)).toEqual([200, 200]);
    expect(updated.polygon).toBe(true);
  });

  it("dragging the first point within the threshold closes the line", () => {
    createOpenSquare("line");

    mouse.downAt(200, 200);
    clearCanvasEvents();
    // 12.8px from the last point
    mouse.moveTo(208, 290);
    expect(closeIndicatorDrawnAt(200, 300)).toBe(true);
    mouse.upAt(208, 290);

    const updated = h.elements[0] as ExcalidrawLinearElement;
    expect(updated.points.length).toBe(4);
    expect(globalPoint(updated, 0)).toEqual(globalPoint(updated, -1));
    expect(globalPoint(updated, -1)).toEqual([200, 300]);
    expect(updated.polygon).toBe(true);
  });

  it("dragging the last point beyond the threshold leaves the line open", () => {
    createOpenSquare("line");

    mouse.downAt(200, 300);
    clearCanvasEvents();
    // 27.7px from the first point
    mouse.moveTo(225, 212);
    expect(interactiveScenePainted()).toBe(true);
    expect(closeIndicatorDrawnAt(200, 200)).toBe(false);
    mouse.upAt(225, 212);

    const updated = h.elements[0] as ExcalidrawLinearElement;
    expect(globalPoint(updated, -1)).toEqual([225, 212]);
    expect(updated.polygon).toBe(false);
  });

  it("arrows do not close", () => {
    createOpenSquare("arrow");

    mouse.downAt(200, 300);
    clearCanvasEvents();
    mouse.moveTo(210, 208);
    expect(interactiveScenePainted()).toBe(true);
    expect(closeIndicatorDrawnAt(200, 200)).toBe(false);
    mouse.upAt(210, 208);

    const updated = h.elements[0] as ExcalidrawLinearElement;
    expect(globalPoint(updated, -1)).toEqual([210, 208]);
    expect(globalPoint(updated, 0)).toEqual([200, 200]);
  });

  it("drawing shows the indicator when the trailing point snaps to the first", () => {
    act(() => {
      h.app.setActiveTool({ type: "line" });
    });
    // multi-point creation: the trailing point follows the pointer
    mouse.clickAt(200, 200);
    mouse.moveTo(300, 200);
    mouse.clickAt(300, 200);
    mouse.moveTo(300, 300);
    mouse.clickAt(300, 300);
    // the first move adds the trailing point, the next ones move it
    mouse.moveTo(250, 250);
    clearCanvasEvents();
    mouse.moveTo(210, 208);

    expect(h.state.multiElement?.points.length).toBe(4);
    expect(closeIndicatorDrawnAt(200, 200)).toBe(true);

    clearCanvasEvents();
    mouse.moveTo(240, 230);
    expect(interactiveScenePainted()).toBe(true);
    expect(closeIndicatorDrawnAt(200, 200)).toBe(false);
  });

  it("a closed line in the editor shows no indicator while nothing is dragged", () => {
    const polygon = {
      ...API.createElement({
        type: "line",
        x: 200,
        y: 200,
        width: 100,
        height: 100,
        roughness: 0,
        roundness: null,
        points: [...OPEN_SQUARE, pointFrom<LocalPoint>(0, 0)],
      }),
      polygon: true,
    } as ExcalidrawLinearElement;
    API.setElements([polygon]);
    enterEditor();

    clearCanvasEvents();
    // repaint the editor without dragging
    act(() => {
      h.app.setState({
        selectedLinearElement: { ...h.state.selectedLinearElement! },
      });
    });
    expect(interactiveScenePainted()).toBe(true);
    expect(closeIndicatorDrawnAt(200, 200)).toBe(false);
  });
});
