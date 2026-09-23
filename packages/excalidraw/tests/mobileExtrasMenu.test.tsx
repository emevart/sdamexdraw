import React from "react";

import { reseed } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { act, fireEvent, render, unmountComponent } from "./test-utils";

const { h } = window;

describe("phone extra tools (sdamex #5069)", () => {
  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    // phone layout, set deterministically: refreshEditorInterface() alone
    // does not re-render; window "resize" runs App.onResize (refresh + setState)
    await render(<Excalidraw UIOptions={{ getFormFactor: () => "phone" }} />);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
  });

  it("has no empty Generate section and keeps Mermaid", () => {
    expect(h.app.editorInterface.formFactor).toBe("phone");

    const trigger = document.querySelector<HTMLElement>(
      ".App-toolbar__extra-tools-trigger--mobile",
    );
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger!);

    const dropdown = document.querySelector(
      ".App-toolbar__extra-tools-dropdown",
    );
    expect(dropdown).not.toBeNull();
    expect(dropdown!.textContent).not.toContain("Generate");
    expect(
      dropdown!.querySelector('[data-testid="toolbar-mermaid"]'),
    ).not.toBeNull();
  });
});
