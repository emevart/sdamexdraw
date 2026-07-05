import React from "react";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { act, render, unmountComponent } from "./test-utils";

import type { ExcalidrawImperativeAPI } from "../types";

// window test handle, same pattern as regressionTests.test.tsx
const { h } = window;

// sdamex: external pending-erasure preview (scratch-to-erase in the host app).
describe("api.setElementsPendingErasure", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw />);
  });

  it("sets and clears the pending-erasure set used by the eraser preview", () => {
    const api = (h.app as any).api as ExcalidrawImperativeAPI;
    const rect = API.createElement({ type: "rectangle", x: 0, y: 0 });
    API.setElements([rect]);

    act(() => {
      api.setElementsPendingErasure([rect.id]);
    });
    // The eraser preview reads this instance set at render time.
    expect((h.app as any).elementsPendingErasure).toEqual(new Set([rect.id]));

    act(() => {
      api.setElementsPendingErasure([]);
    });
    expect((h.app as any).elementsPendingErasure).toEqual(new Set());
  });
});
