import React from "react";

import { KEYS } from "@excalidraw/common";

import { getToolShortcutKeys } from "../components/shapes";
import { Excalidraw } from "../index";

import { render, unmountComponent } from "./test-utils";

describe("toolbar shortcut labels (sdamex #3079)", () => {
  beforeEach(() => {
    unmountComponent();
  });

  it("lists only the keys a tool has", () => {
    expect(getToolShortcutKeys(KEYS.H, null)).toEqual(["H"]);
    expect(getToolShortcutKeys([KEYS.V, KEYS.Q], KEYS["1"])).toEqual([
      "V",
      "1",
    ]);
    expect(getToolShortcutKeys(null, null)).toEqual([]);
  });

  it("never announces a null shortcut", async () => {
    await render(<Excalidraw />);
    const inputs = document.querySelectorAll<HTMLInputElement>(
      "input[aria-keyshortcuts]",
    );

    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => {
      expect(input.getAttribute("aria-keyshortcuts")).not.toMatch(/null/);
    });
  });
});
