import React from "react";

import { pointFrom } from "@excalidraw/math";

import type { GlobalPoint } from "@excalidraw/math";

import type {
  ExcalidrawArrowElement,
  ExcalidrawBindableElement,
} from "@excalidraw/element/types";

import { Excalidraw, sceneCoordsToViewportCoords } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import {
  act,
  GlobalTestState,
  render,
  unmountComponent,
  waitFor,
} from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

// left side midpoint (600, 405): its Y is off the 20px grid (400 / 420)
const createRectangle = () => {
  const rect = API.createElement({
    type: "rectangle",
    id: "grid-snap-binding-rect",
    x: 600,
    y: 305,
    width: 200,
    height: 200,
  }) as ExcalidrawBindableElement;
  API.setElements([rect]);
  return rect;
};

const toViewport = (point: GlobalPoint) =>
  sceneCoordsToViewportCoords({ sceneX: point[0], sceneY: point[1] }, h.state);

const drawArrow = (from: GlobalPoint, to: GlobalPoint) => {
  const start = toViewport(from);
  const end = toViewport(to);
  act(() => {
    h.app.setActiveTool({ type: "arrow" });
  });
  mouse.downAt(start.x, start.y);
  mouse.moveTo(end.x, end.y);
  mouse.upAt(end.x, end.y);

  const arrow = h.elements.find(
    (element): element is ExcalidrawArrowElement => element.type === "arrow",
  );
  expect(arrow).toBeDefined();
  return arrow!;
};

// the suggested binding draws side midpoints as 4px dots (interactiveScene)
const interactiveContext = () =>
  GlobalTestState.interactiveCanvas.getContext("2d") as any;
const clearCanvasEvents = () => interactiveContext().__clearEvents();
const midpointIndicatorDrawnAt = (x: number, y: number) =>
  interactiveContext()
    .__getEvents()
    .some(
      (event: any) =>
        event.type === "arc" &&
        event.props.radius === 4 &&
        Math.abs(event.props.x - x) < 0.01 &&
        Math.abs(event.props.y - y) < 0.01,
    );

const arrowEnd = (arrow: ExcalidrawArrowElement) => {
  const end = arrow.points.at(-1)!;
  return [arrow.x + end[0], arrow.y + end[1]];
};

describe("arrow binding with the grid shown (sdamex #5176)", () => {
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    mouse.reset();
  });

  it("grid shown, grid snapping off: the arrow binds to the side midpoint", () => {
    const rect = createRectangle();
    API.setAppState({
      gridModeEnabled: true,
      gridSnapEnabled: false,
      gridSize: 20,
      isMidpointSnappingEnabled: true,
    });

    const arrow = drawArrow(
      pointFrom<GlobalPoint>(300, 402),
      pointFrom<GlobalPoint>(596, 402),
    );

    // same as with the grid hidden: fixed point on the left midpoint
    expect(arrow.endBinding?.elementId).toBe(rect.id);
    expect(arrow.endBinding!.fixedPoint[0]).toBeCloseTo(0, 3);
    expect(arrow.endBinding!.fixedPoint[1]).toBeCloseTo(0.5, 3);
    expect(arrowEnd(arrow)[1]).toBeCloseTo(405, 0);
  });

  it("grid shown, grid snapping off: the bound point is not rounded to the grid", () => {
    const rect = createRectangle();
    API.setAppState({
      gridModeEnabled: true,
      gridSnapEnabled: false,
      gridSize: 20,
      isMidpointSnappingEnabled: false,
    });

    const arrow = drawArrow(
      pointFrom<GlobalPoint>(300, 402),
      pointFrom<GlobalPoint>(596, 402),
    );

    // same as with the grid hidden: the end stays at y 402, not on 400
    expect(arrow.endBinding?.elementId).toBe(rect.id);
    expect(arrow.endBinding!.fixedPoint[0]).toBeCloseTo(0.485, 3);
    expect(arrow.endBinding!.fixedPoint[1]).toBeCloseTo(0.485, 3);
    expect(arrowEnd(arrow)[1]).toBeCloseTo(402, 3);
  });

  it("grid shown, grid snapping off: midpoint indicators are drawn while binding", async () => {
    createRectangle();
    API.setAppState({
      gridModeEnabled: true,
      gridSnapEnabled: false,
      gridSize: 20,
      isMidpointSnappingEnabled: true,
    });
    act(() => {
      h.app.setActiveTool({ type: "arrow" });
    });

    const start = toViewport(pointFrom<GlobalPoint>(300, 402));
    const end = toViewport(pointFrom<GlobalPoint>(596, 402));
    mouse.downAt(start.x, start.y);
    mouse.moveTo(start.x + 100, start.y);
    clearCanvasEvents();
    mouse.moveTo(end.x, end.y);

    // the hovered left midpoint (600, 405) is highlighted
    await waitFor(() => {
      expect(midpointIndicatorDrawnAt(600, 405)).toBe(true);
    });
    mouse.upAt(end.x, end.y);
  });

  it("grid snapping on: binding keeps the grid behaviour (unchanged)", () => {
    const rect = createRectangle();
    API.setAppState({
      gridModeEnabled: true,
      gridSnapEnabled: true,
      gridSize: 20,
      isMidpointSnappingEnabled: true,
    });

    const arrow = drawArrow(
      pointFrom<GlobalPoint>(300, 402),
      pointFrom<GlobalPoint>(596, 402),
    );

    // no midpoint snapping, the bound point is on the grid line y 400
    expect(arrow.endBinding?.elementId).toBe(rect.id);
    expect(arrow.endBinding!.fixedPoint[0]).toBeCloseTo(0.475, 3);
    expect(arrow.endBinding!.fixedPoint[1]).toBeCloseTo(0.475, 3);
    expect(arrowEnd(arrow)).toEqual([594, 400]);
  });
});
