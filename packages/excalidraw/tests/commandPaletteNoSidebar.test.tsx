import React from "react";

import { DEFAULT_SIDEBAR_AVAILABLE } from "@excalidraw/common";

import { CommandPalette, Excalidraw } from "../index";

import { API } from "./helpers/api";
import { act, render, unmountComponent, waitFor } from "./test-utils";

const paletteLabels = () =>
  Array.from(document.querySelectorAll(".command-item")).map(
    (item) => item.textContent ?? "",
  );

// sdamex #5069: without the sidebar (DEFAULT_SIDEBAR_AVAILABLE = false) the
// library and the canvas search open nothing, so the command palette does not
// offer them. Ctrl+F and "Add to library" follow the same flag. SdamEx does not
// render the palette today; the guard keeps one flag for every entry point.
describe("command palette without the sidebar (sdamex #5069)", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(
      <Excalidraw handleKeyboardGlobally={true}>
        <CommandPalette />
      </Excalidraw>,
    );
  });

  it("the sidebar is off in this fork", () => {
    expect(DEFAULT_SIDEBAR_AVAILABLE).toBe(false);
  });

  it("offers neither the library nor the canvas search", async () => {
    act(() => {
      API.setAppState({ openDialog: { name: "commandPalette" } });
    });
    await waitFor(() => expect(paletteLabels().length).toBeGreaterThan(0));

    const labels = paletteLabels();
    expect(labels.some((label) => label.includes("Library"))).toBe(false);
    expect(labels.some((label) => label.includes("Find on canvas"))).toBe(
      false,
    );
    // the palette itself still lists its other commands
    expect(labels.length).toBeGreaterThan(5);
  });
});
