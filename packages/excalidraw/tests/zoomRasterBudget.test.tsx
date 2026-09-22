import rough from "roughjs/bin/rough";
import { vi } from "vitest";

import { arrayToMap } from "@excalidraw/common";
import {
  elementWithCanvasCache,
  setZoomRasterBudgetForTests,
} from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import { renderStaticScene } from "../renderer/staticScene";

import { API } from "./helpers/api";

import type { StaticCanvasRenderConfig } from "../scene/types";
import type { StaticCanvasAppState } from "../types";

type Theme = "light" | "dark";

const frames: FrameRequestCallback[] = [];
const cancelled: number[] = [];

const paint = (
  canvas: HTMLCanvasElement,
  elements: NonDeletedExcalidrawElement[],
  zoom: number,
  {
    theme = "light",
    isExporting = false,
  }: { theme?: Theme; isExporting?: boolean } = {},
) => {
  const elementsMap = arrayToMap(elements) as any;
  const renderConfig: StaticCanvasRenderConfig = {
    canvasBackgroundColor: "#ffffff",
    imageCache: new Map(),
    renderGrid: false,
    isExporting,
    embedsValidationStatus: new Map(),
    elementsPendingErasure: new Set(),
    pendingFlowchartNodes: null,
    theme,
  };
  renderStaticScene(
    {
      canvas,
      rc: rough.canvas(canvas),
      elementsMap,
      allElementsMap: elementsMap,
      visibleElements: elements,
      scale: 1,
      appState: {
        ...getDefaultAppState(),
        width: 1000,
        height: 1000,
        offsetLeft: 0,
        offsetTop: 0,
        theme,
        zoom: { value: zoom },
      } as unknown as StaticCanvasAppState,
      renderConfig,
    },
    false,
  );
};

const zoomOf = (element: NonDeletedExcalidrawElement) =>
  elementWithCanvasCache.get(element)?.zoomValue;

describe("zoom re-rasterization budget (sdamex)", () => {
  beforeEach(() => {
    frames.length = 0;
    cancelled.length = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelled.push(id);
    });
    setZoomRasterBudgetForTests(true);
  });

  afterEach(() => {
    setZoomRasterBudgetForTests(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const twoRectangles = () => [
    API.createElement({ type: "rectangle", x: 0, y: 0, width: 50 }),
    API.createElement({ type: "rectangle", x: 100, y: 0, width: 50 }),
  ];

  // every performance.now() call moves the clock past an 8 ms budget
  const exhaustBudget = () => {
    let now = 0;
    return vi.spyOn(performance, "now").mockImplementation(() => (now += 100));
  };

  it("defers zoom-only regeneration past the budget and finishes it next frame", () => {
    const canvas = document.createElement("canvas");
    const [a, b] = twoRectangles();
    paint(canvas, [a, b], 1);
    expect(zoomOf(a)).toBe(1);

    const clock = exhaustBudget();
    paint(canvas, [a, b], 2);

    expect(zoomOf(a)).toBe(1);
    expect(zoomOf(b)).toBe(1);
    expect(frames).toHaveLength(1);

    clock.mockImplementation(() => 0);
    frames.shift()!(0);

    expect(zoomOf(a)).toBe(2);
    expect(zoomOf(b)).toBe(2);
    expect(frames).toHaveLength(0);
  });

  it("regenerates everything within the budget", () => {
    const canvas = document.createElement("canvas");
    const [a, b] = twoRectangles();
    paint(canvas, [a, b], 1);

    vi.spyOn(performance, "now").mockImplementation(() => 0);
    paint(canvas, [a, b], 2);

    expect(zoomOf(a)).toBe(2);
    expect(zoomOf(b)).toBe(2);
    expect(frames).toHaveLength(0);
  });

  it("always regenerates canvases stale for non-zoom reasons", () => {
    const canvas = document.createElement("canvas");
    const [a] = twoRectangles();
    paint(canvas, [a], 1);

    exhaustBudget();
    paint(canvas, [a], 2, { theme: "dark" });

    expect(elementWithCanvasCache.get(a)?.theme).toBe("dark");
    expect(zoomOf(a)).toBe(2);
    expect(frames).toHaveLength(0);
  });

  it("cancels a scheduled continuation when a newer paint arrives", () => {
    const canvas = document.createElement("canvas");
    const [a, b] = twoRectangles();
    paint(canvas, [a, b], 1);

    exhaustBudget();
    paint(canvas, [a, b], 2);
    expect(frames).toHaveLength(1);

    paint(canvas, [a, b], 3);

    expect(cancelled).toContain(1);
  });

  it("never defers while exporting", () => {
    const canvas = document.createElement("canvas");
    const [a, b] = twoRectangles();
    paint(canvas, [a, b], 1);

    exhaustBudget();
    paint(canvas, [a, b], 2, { isExporting: true });

    expect(frames).toHaveLength(0);
  });
});
