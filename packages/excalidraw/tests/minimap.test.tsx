import React from "react";
import { vi } from "vitest";

import { Excalidraw } from "../index";
import { computeMinimapLayout } from "../components/Minimap";

import { API } from "./helpers/api";
import { act, render, unmountComponent, waitFor } from "./test-utils";

const { h } = window;

describe("Minimap layout & offscreen caching", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("computeMinimapLayout expands bounds cleanly and keeps aspect ratio", () => {
    const rect = API.createElement({
      type: "rectangle",
      x: -400,
      y: -300,
      width: 1200,
      height: 900,
    });
    const layout = computeMinimapLayout([rect], {
      scrollX: 0,
      scrollY: 0,
      width: 400,
      height: 300,
      zoom: { value: 1 },
    });

    expect(layout.sceneMinX).toBeLessThan(-400);
    expect(layout.sceneMaxX).toBeGreaterThan(800);
    expect(layout.scale).toBeGreaterThan(0);
    // Viewport center maps cleanly inside minimap rectangle
    const centerX = layout.toMiniX(200);
    const centerY = layout.toMiniY(150);
    expect(centerX).toBeGreaterThan(0);
    expect(centerX).toBeLessThan(150);
    expect(centerY).toBeGreaterThan(0);
    expect(centerY).toBeLessThan(100);
  });

  it("reuses offscreen elements bitmap across pan/zoom updates without redrawing scene elements", async () => {
    // Large scene so panning viewport stays well inside element bounds
    const bounds = API.createElement({
      type: "rectangle",
      id: "outer",
      x: -1000,
      y: -1000,
      width: 3000,
      height: 3000,
    });
    const inner = API.createElement({
      type: "ellipse",
      id: "inner",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
    });

    // Populate scene before spying on canvas creation so per-element shape caches
    // are not confused with the minimap's own offscreen bitmap cache.
    act(() => {
      API.setElements([bounds, inner]);
    });

    const createdCanvases: HTMLCanvasElement[] = [];
    const origCreateElement = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const el = origCreateElement(tagName, options);
      if (tagName.toLowerCase() === "canvas") {
        createdCanvases.push(el as HTMLCanvasElement);
      }
      return el;
    }) as typeof document.createElement);

    try {
      act(() => {
        API.setAppState({ showMinimap: true, scrollX: 0, scrollY: 0 });
      });

      await waitFor(() => {
        expect(document.querySelector("canvas.minimap__canvas")).not.toBeNull();
      });

      // Allow rAF paint to run
      await new Promise((r) => setTimeout(r, 40));

      const minimapCanvas = document.querySelector(
        "canvas.minimap__canvas",
      ) as HTMLCanvasElement;
      const visibleCtx = minimapCanvas.getContext("2d") as any;
      const visibleEvents = visibleCtx.__getEvents() as Array<{ type: string }>;
      // Visible canvas composites cached offscreen canvas instead of redrawing elements directly
      expect(visibleEvents.some((e) => e.type === "drawImage")).toBe(true);

      // Snapshot offscreen canvas count and event count after initial paint
      const offscreenCanvasesAfterInit = createdCanvases.filter(
        (c) =>
          c !== minimapCanvas &&
          !c.isConnected &&
          c.width === minimapCanvas.width &&
          c.height === minimapCanvas.height,
      );
      expect(offscreenCanvasesAfterInit.length).toBe(1);
      const offscreenCtx = offscreenCanvasesAfterInit[0].getContext(
        "2d",
      ) as any;
      const offscreenEventsBeforePan = offscreenCtx.__getEvents().length;

      // Pan & zoom multiple times while staying inside scene bounds
      act(() => {
        h.app.setState({ scrollX: -50, scrollY: -40 });
      });
      await new Promise((r) => setTimeout(r, 30));
      act(() => {
        h.app.setState({
          scrollX: -120,
          scrollY: -90,
          zoom: { value: 1.5 as any },
        });
      });
      await new Promise((r) => setTimeout(r, 40));

      // Offscreen element cache was NOT recreated and did NOT redraw elements
      const offscreenCanvasesAfterPan = createdCanvases.filter(
        (c) =>
          c !== minimapCanvas &&
          !c.isConnected &&
          c.width === minimapCanvas.width &&
          c.height === minimapCanvas.height,
      );
      expect(offscreenCanvasesAfterPan.length).toBe(1);
      expect(offscreenCtx.__getEvents().length).toBe(offscreenEventsBeforePan);
    } finally {
      createSpy.mockRestore();
    }
  });
});
