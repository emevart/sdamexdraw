import React from "react";
import { act } from "react-dom/test-utils";

import { KEYS, MQ_MIN_WIDTH_DESKTOP } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

// UI.clickTool is a no-op in this isolated jsdom setup (see
// tabletInputPolicy.test.tsx) — set the tool imperatively instead.
const setTool = (type: "freedraw" | "rectangle") => {
  act(() => {
    h.app.setActiveTool({ type });
  });
};

beforeEach(async () => {
  unmountComponent();
  localStorage.clear();
  mouse.reset();

  await render(<Excalidraw handleKeyboardGlobally={true} />);
  API.setAppState({ height: 768, width: MQ_MIN_WIDTH_DESKTOP });
});

describe("Q switches to the selection tool immediately", () => {
  it("switches from freedraw to selection on a single Q press", () => {
    setTool("freedraw");
    expect(h.state.activeTool.type).toBe("freedraw");

    Keyboard.keyPress(KEYS.Q);

    expect(h.state.activeTool.type).toBe("selection");
  });

  it("does not enable tool lock", () => {
    setTool("rectangle");

    Keyboard.keyPress(KEYS.Q);

    expect(h.state.activeTool.type).toBe("selection");
    expect(h.state.activeTool.locked).toBe(false);
  });

  it("stays on selection (unlocked) on repeated presses", () => {
    setTool("freedraw");

    Keyboard.keyPress(KEYS.Q);
    Keyboard.keyPress(KEYS.Q);

    expect(h.state.activeTool.type).toBe("selection");
    expect(h.state.activeTool.locked).toBe(false);
  });

  it("preserves an already enabled tool lock (Q only changes the tool)", () => {
    setTool("freedraw");
    API.setAppState({
      activeTool: { ...h.state.activeTool, locked: true },
    });

    Keyboard.keyPress(KEYS.Q);

    expect(h.state.activeTool.type).toBe("selection");
    expect(h.state.activeTool.locked).toBe(true);
  });
});
