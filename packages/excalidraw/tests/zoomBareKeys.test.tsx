import React from "react";

import { CODES, reseed } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { Keyboard } from "./helpers/ui";
import { fireEvent, render, unmountComponent } from "./test-utils";

const { h } = window;

describe("zoom with bare + and - (sdamex #2667)", () => {
  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("bare = and - zoom in and out", () => {
    expect(h.state.zoom.value).toBe(1);
    Keyboard.codePress(CODES.EQUAL);
    expect(h.state.zoom.value).toBeGreaterThan(1);
    Keyboard.codePress(CODES.MINUS);
    expect(h.state.zoom.value).toBe(1);
  });

  it("numpad + and - zoom", () => {
    Keyboard.codePress(CODES.NUM_ADD);
    expect(h.state.zoom.value).toBeGreaterThan(1);
    Keyboard.codePress(CODES.NUM_SUBTRACT);
    expect(h.state.zoom.value).toBe(1);
  });

  it("Alt+= does not zoom", () => {
    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.EQUAL);
    });
    expect(h.state.zoom.value).toBe(1);
  });

  it("typing = and - in an input does not zoom", () => {
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);

    fireEvent.keyDown(input, { code: CODES.EQUAL, key: "=" });
    fireEvent.keyDown(input, { code: CODES.MINUS, key: "-" });

    expect(h.state.zoom.value).toBe(1);
    input.remove();
  });
});
