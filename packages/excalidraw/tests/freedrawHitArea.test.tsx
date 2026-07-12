import React from "react";

import { MQ_MIN_WIDTH_DESKTOP } from "@excalidraw/common";

import type { LocalPoint } from "@excalidraw/math";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

const STRAIGHT_POINTS = [
  [0, 0],
  [50, 0],
  [100, 0],
  [150, 0],
  [200, 0],
] as LocalPoint[];

beforeEach(async () => {
  unmountComponent();
  localStorage.clear();
  mouse.reset();

  await render(<Excalidraw handleKeyboardGlobally={true} />);
  API.setAppState({ height: 768, width: MQ_MIN_WIDTH_DESKTOP });
});

describe("thick freedraw stroke hit area covers the visible ink", () => {
  it("click 21px off the centerline of a strokeWidth-12 stroke selects it", () => {
    // ink radius = strokeWidth * 4.25 / 2 = 25.5px; the old flat threshold
    // (~17px at zoom 1) left a dead zone between 17px and 25.5px where the
    // pixel is visibly inked but the click missed the element
    const element = API.createElement({
      type: "freedraw",
      x: 100,
      y: 300,
      points: STRAIGHT_POINTS,
      strokeWidth: 12,
    });
    API.setElements([element]);

    mouse.clickAt(200, 321);

    expect(API.getSelectedElement().id).toBe(element.id);
  });

  it("click well outside the ink (45px off) does not select", () => {
    const element = API.createElement({
      type: "freedraw",
      x: 100,
      y: 300,
      points: STRAIGHT_POINTS,
      strokeWidth: 12,
    });
    API.setElements([element]);

    mouse.clickAt(200, 345);

    expect(Object.keys(h.state.selectedElementIds).length).toBe(0);
  });

  it("thin stroke keeps the forgiving flat threshold (14px off still hits)", () => {
    const element = API.createElement({
      type: "freedraw",
      x: 100,
      y: 300,
      points: STRAIGHT_POINTS,
      strokeWidth: 1,
    });
    API.setElements([element]);

    mouse.clickAt(200, 314);

    expect(API.getSelectedElement().id).toBe(element.id);
  });
});
