import React from "react";

import { STATS_PANELS } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { UI } from "./helpers/ui";
import { render, unmountComponent, waitFor } from "./test-utils";

const openGeneralStats = () => {
  API.setAppState({
    stats: { open: true, panels: STATS_PANELS.generalStats },
  });
};

describe("properties panel grid step label (sdamex #5176)", () => {
  beforeEach(() => {
    unmountComponent();
    localStorage.clear();
  });

  it("is translated with the editor language", async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        gridModeEnabled={true}
        langCode="ru-RU"
      />,
    );
    openGeneralStats();

    await waitFor(() => {
      expect(UI.queryStats()?.textContent).toContain("Шаг сетки");
    });
    const text = UI.queryStats()!.textContent!;
    expect(text).toContain("Холст");
    expect(text).not.toContain("Grid step");
    expect(text).not.toContain("Canvas");
  });

  it("stays English by default", async () => {
    await render(
      <Excalidraw handleKeyboardGlobally={true} gridModeEnabled={true} />,
    );
    openGeneralStats();

    await waitFor(() => {
      expect(UI.queryStats()?.textContent).toContain("Grid step");
    });
    expect(UI.queryStats()!.textContent).toContain("Canvas");
  });
});
