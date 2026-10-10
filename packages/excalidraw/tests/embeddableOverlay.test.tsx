import React from "react";
import { vi } from "vitest";

import { arrayToMap, reseed } from "@excalidraw/common";
import * as ElementModule from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";
import * as InteractiveScene from "../renderer/interactiveScene";
import {
  getAboveEmbeddablesBands,
  renderAboveEmbeddablesScene,
  renderStaticScene,
} from "../renderer/staticScene";
import { getDefaultAppState } from "../appState";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import {
  act,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  unmountComponent,
  waitFor,
} from "./test-utils";

import type { RenderableElementsMap } from "../scene/types";
import type { StaticCanvasAppState } from "../types";

const { h } = window;

// sdamex #5878: strokes, selection and cursors above embeddables

const stroke = (id: string, x: number, y: number, size = 40) =>
  API.createElement({
    type: "freedraw",
    id,
    x,
    y,
    width: size,
    height: size,
    points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(size, size)],
  });

// `API.createElement` drops `link`
const embed = (id: string, x: number, y: number) => ({
  ...API.createElement({
    type: "embeddable",
    id,
    x,
    y,
    width: 100,
    height: 60,
  }),
  link: `https://example.com/${id}`,
});

const ids = (elements: readonly ExcalidrawElement[]) =>
  elements.map((element) => element.id);

describe("getAboveEmbeddablesBands", () => {
  const bandsOf = (elements: NonDeletedExcalidrawElement[]) =>
    getAboveEmbeddablesBands(elements).map((band) => ({
      above: ids(band.above),
      elements: ids(band.elements),
    }));

  it("is empty without embeddables", () => {
    expect(bandsOf([stroke("a", 0, 0), stroke("b", 10, 10)])).toEqual([]);
  });

  it("keeps a stroke drawn before the embeddable under it", () => {
    expect(bandsOf([stroke("under", 20, 20), embed("e", 0, 0)])).toEqual([]);
  });

  it("moves everything stacked above the lowest embeddable over it", () => {
    expect(
      bandsOf([
        stroke("under", 20, 20),
        embed("e", 0, 0),
        stroke("over", 20, 20),
        stroke("elsewhere", 1000, 1000),
      ]),
    ).toEqual([{ above: [], elements: ["over", "elsewhere"] }]);
  });

  it("lets a higher embeddable cover a stroke between two embeddables", () => {
    expect(
      bandsOf([
        embed("e1", 0, 0),
        stroke("between", 20, 20),
        embed("e2", 50, 30),
        stroke("top", 60, 40),
      ]),
    ).toEqual([
      { above: ["e2"], elements: ["between"] },
      { above: [], elements: ["top"] },
    ]);
  });
});

describe("canvases around the embeddables", () => {
  const renderElement = vi.spyOn(ElementModule, "renderElement");

  afterAll(() => {
    renderElement.mockRestore();
  });

  const paint = (
    elements: NonDeletedExcalidrawElement[],
    layer: "belowEmbeddables" | "aboveEmbeddables" | undefined,
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const elementsMap = arrayToMap(
      elements,
    ) as unknown as RenderableElementsMap;
    renderElement.mockClear();
    const config = {
      canvas,
      rc: null as any,
      elementsMap,
      allElementsMap: elementsMap as unknown as NonDeletedSceneElementsMap,
      visibleElements: elements,
      scale: 1,
      appState: getDefaultAppState() as unknown as StaticCanvasAppState,
      renderConfig: {
        imageCache: new Map(),
        renderGrid: true,
        canvasBackgroundColor: "#ffffff",
        isExporting: false,
        embedsValidationStatus: new Map(),
        elementsPendingErasure: new Set<string>(),
        pendingFlowchartNodes: null,
        theme: "light" as const,
      },
    };
    if (layer === "aboveEmbeddables") {
      renderAboveEmbeddablesScene(config);
    } else {
      renderStaticScene({ ...config, layer });
    }
    return {
      // without `embedsValidationStatus` the embeddables also get their
      // placeholder labels (temporary text elements), left out here
      drawn: renderElement.mock.calls
        .map(([element]) => element.id)
        .filter((id) => elementsMap.has(id)),
      events: (canvas.getContext("2d") as any).__getEvents() as {
        type: string;
        props: Record<string, unknown>;
      }[],
    };
  };

  const scene = () => [
    stroke("under", 20, 20),
    embed("e1", 0, 0),
    stroke("between", 20, 20),
    embed("e2", 50, 30),
    stroke("top", 60, 40),
  ];

  it("paints elements above the lowest embeddable on the layer over them", () => {
    const { drawn, events } = paint(scene(), "aboveEmbeddables");
    expect(drawn).toEqual(["between", "top"]);
    // `between` is clipped to exclude e2
    expect(
      events
        .filter((event) => event.type === "clip")
        .map((event) => event.props.fillRule),
    ).toEqual(["evenodd"]);
    // transparent layer: no background fill
    expect(events.some((event) => event.type === "fillRect")).toBe(false);
  });

  it("leaves them off the static canvas under the embeddables", () => {
    const { drawn } = paint(scene(), "belowEmbeddables");
    // embeddables are painted last (placeholder, link icon), as before
    expect(drawn).toEqual(["under", "e1", "e2"]);
  });

  it("still paints everything without a layer (export)", () => {
    const { drawn } = paint(scene(), undefined);
    expect(drawn).toEqual(["under", "between", "top", "e1", "e2"]);
  });

  it("paints nothing over the embeddables without embeddables", () => {
    const { drawn } = paint([stroke("a", 0, 0)], "aboveEmbeddables");
    expect(drawn).toEqual([]);
    expect(paint([stroke("a", 0, 0)], "belowEmbeddables").drawn).toEqual(["a"]);
  });
});

describe("layers above embeddables", () => {
  beforeAll(() => {
    mockBoundingClientRect();
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    await render(
      <Excalidraw
        validateEmbeddable={true}
        renderEmbeddable={() => <div data-testid="embed-body" />}
      />,
    );
  });

  it("stacks the overlay, the new-element and the visible interactive canvas after the embeddables", async () => {
    act(() => {
      API.setElements([embed("e", 10, 10), stroke("over", 20, 20)]);
    });

    const container = document.querySelector(".excalidraw")!;
    await waitFor(() =>
      expect(
        container.querySelector(".excalidraw__embeddable-container"),
      ).not.toBeNull(),
    );
    const embedContainer = container.querySelector(
      ".excalidraw__embeddable-container",
    )!;

    const layer = container.querySelector(".excalidraw__above-embeddables")!;
    expect(layer).not.toBeNull();
    expect(
      embedContainer.compareDocumentPosition(layer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // the pointer target stays under the embeddables, so live embeds still
    // get the pointer with the selection tool
    const eventCanvas = container.querySelector("canvas.interactive")!;
    expect(layer.contains(eventCanvas)).toBe(false);
    expect(
      eventCanvas.compareDocumentPosition(embedContainer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(layer.querySelector("canvas.above-embeddables")).not.toBeNull();
    expect(layer.querySelector("canvas.interactive-visual")).not.toBeNull();
    expect(h.app.visibleElements.map((element) => element.id)).toContain(
      "over",
    );
  });

  it("paints the interactive scene and the new element above the embeddables", async () => {
    const renderInteractiveScene = vi.spyOn(
      InteractiveScene,
      "renderInteractiveScene",
    );
    act(() => {
      API.setElements([embed("e", 10, 10)]);
    });
    const container = document.querySelector(".excalidraw")!;
    await waitFor(() =>
      expect(
        container.querySelector(".excalidraw__embeddable-container"),
      ).not.toBeNull(),
    );
    const layer = container.querySelector(".excalidraw__above-embeddables")!;

    renderInteractiveScene.mockClear();
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    const pen = new Pointer("mouse");
    pen.down(30, 30);
    pen.move(20, 20);

    // the stroke in progress is on the new-element canvas inside the layer
    expect(h.state.newElement?.type).toBe("freedraw");
    const layerCanvases = [...layer.querySelectorAll("canvas")];
    expect(
      layerCanvases.some(
        (canvas) =>
          !canvas.classList.contains("interactive-visual") &&
          !canvas.classList.contains("above-embeddables"),
      ),
    ).toBe(true);
    pen.up();

    expect(renderInteractiveScene).toHaveBeenCalled();
    const painted = renderInteractiveScene.mock.calls.map(
      ([config]) => config.canvas,
    );
    expect(
      painted.every((canvas) =>
        canvas?.classList.contains("interactive-visual"),
      ),
    ).toBe(true);
    renderInteractiveScene.mockRestore();
  });

  it("keeps the overlay canvas out of the DOM without embeddables", async () => {
    act(() => {
      API.setElements([stroke("a", 20, 20)]);
    });
    const layer = document.querySelector(".excalidraw__above-embeddables")!;
    expect(layer).not.toBeNull();
    expect(layer.querySelector("canvas.above-embeddables")).toBeNull();
    expect(layer.querySelector("canvas.interactive-visual")).not.toBeNull();
  });
});
