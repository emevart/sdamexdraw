import React from "react";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import { getSelectableElementsOverEmbeddables } from "../components/aboveEmbeddablesHit";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import {
  act,
  fireEvent,
  GlobalTestState,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  unmountComponent,
  waitFor,
} from "./test-utils";

const { h } = window;

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

const rect = (
  id: string,
  x: number,
  y: number,
  w = 40,
  hVal = 40,
  locked = false,
) =>
  API.createElement({
    type: "rectangle",
    id,
    x,
    y,
    width: w,
    height: hVal,
    locked,
  });

const embed = (id: string, x: number, y: number) => ({
  ...API.createElement({
    type: "embeddable",
    id,
    x,
    y,
    width: 200,
    height: 150,
  }),
  link: `https://example.com/${id}`,
});

describe("getSelectableElementsOverEmbeddables (#6126)", () => {
  it("excludes elements below embeddables, non-overlapping, deleted, and locked elements", () => {
    const under = stroke("under", 20, 20);
    const e1 = embed("e1", 0, 0);
    const overOverlap = stroke("over-overlap", 30, 30);
    const overElsewhere = stroke("over-elsewhere", 1000, 1000);
    const overLocked = rect("over-locked", 20, 20, 40, 40, true);
    const overDeleted = { ...rect("over-deleted", 20, 20), isDeleted: true };
    const e2 = embed("e2", 40, 40);

    const elements = [
      under,
      e1,
      overOverlap,
      overElsewhere,
      overLocked,
      overDeleted as any,
      e2,
    ];
    const allMap = new Map(elements.map((el) => [el.id, el]));

    const visible = elements.filter((el) => !el.isDeleted);
    const targets = getSelectableElementsOverEmbeddables({
      visibleElements: visible,
      allElementsMap: allMap as any,
    });

    expect(targets.map((t) => t.element.id)).toEqual(["over-overlap"]);
    expect(targets[0].occludedBy.map((e) => e.id)).toEqual(["e2"]);
  });
});

describe("click-through selection above live embeddables (#6126)", () => {
  beforeAll(() => {
    mockBoundingClientRect({ top: 0, left: 0, width: 1000, height: 1000 });
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  beforeEach(async () => {
    unmountComponent();
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        validateEmbeddable={true}
        renderEmbeddable={() => <div data-testid="embed-body" />}
      />,
    );
  });

  it("renders hit shapes only in selection mode and selects/drags overlapped stroke on pointerdown", async () => {
    const e1 = embed("e1", 0, 0);
    const over = stroke("over", 20, 20, 60);
    act(() => {
      API.setElements([e1, over]);
      h.app.setActiveTool({ type: "selection" });
    });

    const container = document.querySelector(".excalidraw")!;
    await waitFor(() => {
      const svg = container.querySelector(
        "svg.excalidraw__above-embeddables-hit",
      );
      expect(svg).not.toBeNull();
    });

    const svg = container.querySelector(
      "svg.excalidraw__above-embeddables-hit",
    ) as SVGSVGElement;
    expect(svg.style.pointerEvents).toBe("none");

    const hitShape = svg.querySelector(
      '[data-hit-element-id="over"]',
    ) as SVGElement | null;
    expect(hitShape).not.toBeNull();

    // Pointer down directly on the hit target selects `over` and moves it on drag
    fireEvent.pointerDown(hitShape!, {
      clientX: 40,
      clientY: 40,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(h.state.selectedElementIds.over).toBe(true);

    fireEvent.pointerMove(GlobalTestState.interactiveCanvas, {
      clientX: 70,
      clientY: 60,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(GlobalTestState.interactiveCanvas, {
      clientX: 70,
      clientY: 60,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });

    const moved = h.elements.find((el) => el.id === "over")!;
    expect(moved.x).toBeGreaterThan(20);
    expect(moved.y).toBeGreaterThan(20);

    // Switching away from selection removes hit overlay so pen strokes go to board
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    expect(
      container.querySelector("svg.excalidraw__above-embeddables-hit"),
    ).toBeNull();
  });
});
