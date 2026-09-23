import rough from "roughjs/bin/rough";
import { vi } from "vitest";

import { arrayToMap } from "@excalidraw/common";
import { elementWithCanvasCache } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import {
  renderStaticScene,
  renderStaticSceneThrottled,
} from "../renderer/staticScene";

import { API } from "./helpers/api";

import type { StaticCanvasAppState } from "../types";

const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;

const runFrames = () => {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(0));
};

const paintThrottled = (
  canvas: HTMLCanvasElement,
  elements: NonDeletedExcalidrawElement[],
) => {
  const elementsMap = arrayToMap(elements) as any;
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
      } as unknown as StaticCanvasAppState,
      renderConfig: {
        canvasBackgroundColor: "#ffffff",
        imageCache: new Map(),
        renderGrid: false,
        isExporting: false,
        embedsValidationStatus: new Map(),
        elementsPendingErasure: new Set(),
        pendingFlowchartNodes: null,
        theme: "light",
      },
    },
    true,
  );
};

// an element gets a cached canvas once a static paint draws it
const isPainted = (element: NonDeletedExcalidrawElement) =>
  elementWithCanvasCache.has(element);

const rectangle = () =>
  API.createElement({ type: "rectangle", x: 0, y: 0, width: 50 });

describe("per-canvas static paint throttle (sdamex)", () => {
  beforeEach(() => {
    frames.clear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrameId, callback);
      return nextFrameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("paints every canvas scheduled in the same frame", () => {
    const canvasA = document.createElement("canvas");
    const canvasB = document.createElement("canvas");
    const a = rectangle();
    const b = rectangle();

    paintThrottled(canvasA, [a]);
    paintThrottled(canvasB, [b]);

    expect(frames.size).toBe(1);
    expect(isPainted(a)).toBe(false);
    expect(isPainted(b)).toBe(false);

    runFrames();

    expect(isPainted(a)).toBe(true);
    expect(isPainted(b)).toBe(true);
    expect(frames.size).toBe(0);
  });

  it("keeps another canvas's pending paint when one canvas is cancelled", () => {
    const canvasA = document.createElement("canvas");
    const canvasB = document.createElement("canvas");
    const a = rectangle();
    const b = rectangle();

    paintThrottled(canvasA, [a]);
    paintThrottled(canvasB, [b]);
    renderStaticSceneThrottled.cancel(canvasA);
    runFrames();

    expect(isPainted(a)).toBe(false);
    expect(isPainted(b)).toBe(true);
  });

  it("drops the scheduled frame once no canvas is pending", () => {
    const canvas = document.createElement("canvas");
    const a = rectangle();

    paintThrottled(canvas, [a]);
    renderStaticSceneThrottled.cancel(canvas);

    expect(frames.size).toBe(0);
  });

  it("paints only the latest config of a canvas within a frame", () => {
    const canvas = document.createElement("canvas");
    const older = rectangle();
    const latest = rectangle();

    paintThrottled(canvas, [older]);
    paintThrottled(canvas, [latest]);
    runFrames();

    expect(isPainted(older)).toBe(false);
    expect(isPainted(latest)).toBe(true);
  });

  it("paints every pending canvas on flush", () => {
    const canvasA = document.createElement("canvas");
    const canvasB = document.createElement("canvas");
    const a = rectangle();
    const b = rectangle();

    paintThrottled(canvasA, [a]);
    paintThrottled(canvasB, [b]);
    renderStaticSceneThrottled.flush();

    expect(isPainted(a)).toBe(true);
    expect(isPainted(b)).toBe(true);
    expect(frames.size).toBe(0);
  });
});
