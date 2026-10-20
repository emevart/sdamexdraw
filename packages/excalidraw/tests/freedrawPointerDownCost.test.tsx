import React from "react";

import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

import type { PointerDownState } from "../types";

const { h } = window;

const pen = new Pointer("pen", 33);

describe("pointer down of a pen stroke on a big board (sdamex #6066)", () => {
  let downStates: PointerDownState[] = [];

  beforeEach(async () => {
    unmountComponent();
    downStates = [];
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        onPointerDown={(_tool, state) => {
          downStates.push(state);
        }}
      />,
    );
    Pointer.resetAll();
    const elements: ExcalidrawElement[] = [];
    for (let i = 0; i < 50; i++) {
      elements.push(
        API.createElement({
          type: "freedraw",
          x: (i % 10) * 80,
          y: Math.floor(i / 10) * 50,
          points: [
            pointFrom<LocalPoint>(0, 0),
            pointFrom<LocalPoint>(20, 10),
            pointFrom<LocalPoint>(40, 0),
          ],
        }),
      );
    }
    API.setElements(elements);
  });

  it("does not copy every element of the scene when the stroke starts", () => {
    act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });
    pen.downAt(900, 500);
    pen.moveTo(920, 510);
    pen.upAt(920, 510);

    expect(downStates.length).toBe(1);
    // the snapshot is for dragging and resizing a selection; a pen stroke
    // never reads it, and a deep copy of 3000 strokes cost ~35 ms of the
    // first frame of every stroke
    expect(downStates[0].originalElements.size).toBe(0);
  });

  it("keeps the snapshot of the elements for the selection tool (unchanged)", () => {
    act(() => {
      h.app.setActiveTool({ type: "selection" });
    });
    pen.downAt(900, 500);
    pen.upAt(900, 500);

    expect(downStates.length).toBe(1);
    expect(downStates[0].originalElements.size).toBe(50);
  });
});
