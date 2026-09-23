import React from "react";

import { KEYS, reseed } from "@excalidraw/common";

import { actionAddToLibrary } from "../actions/actionAddToLibrary";
import { actionToggleSearchMenu } from "../actions/actionToggleSearchMenu";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { fireEvent, render, unmountComponent } from "./test-utils";

const { h } = window;

describe("no default sidebar (sdamex #5069)", () => {
  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("Ctrl+F reaches the browser", () => {
    const notPrevented = fireEvent.keyDown(document, {
      key: KEYS.F,
      ctrlKey: true,
    });

    expect(notPrevented).toBe(true);
    expect(h.state.openSidebar).toBeNull();
  });

  it("offers neither canvas search nor 'Add to library'", () => {
    const rect = API.createElement({ type: "rectangle" });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    expect(h.app.actionManager.isActionEnabled(actionToggleSearchMenu)).toBe(
      false,
    );
    expect(h.app.actionManager.isActionEnabled(actionAddToLibrary)).toBe(false);
  });
});
