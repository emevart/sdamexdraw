import React from "react";

import { resolvablePromise } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { getToolbarTools } from "../components/shapes";

import { Pointer } from "./helpers/ui";
import { act, fireEvent, render } from "./test-utils";

import type { AppClassProperties, ExcalidrawImperativeAPI } from "../types";

describe("setActiveTool()", () => {
  const h = window.h;

  let excalidrawAPI: ExcalidrawImperativeAPI;
  let unmountApp: () => void;

  const mouse = new Pointer("mouse");

  beforeEach(async () => {
    const excalidrawAPIPromise = resolvablePromise<ExcalidrawImperativeAPI>();
    const renderResult = await render(
      <Excalidraw
        onExcalidrawAPI={(api) => excalidrawAPIPromise.resolve(api as any)}
      />,
    );
    unmountApp = renderResult.unmount;
    excalidrawAPI = await excalidrawAPIPromise;
  });

  it("should expose setActiveTool on package API", () => {
    expect(excalidrawAPI.setActiveTool).toBeDefined();
    expect(excalidrawAPI.setActiveTool).toBe(h.app.setActiveTool);
  });

  it("should set the active tool type", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle" });
    });
    expect(h.state.activeTool.type).toBe("rectangle");

    mouse.down(10, 10);
    mouse.up(20, 20);

    expect(h.state.activeTool.type).toBe("selection");
  });

  it("should support tool locking", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle", locked: true });
    });
    expect(h.state.activeTool.type).toBe("rectangle");

    mouse.down(10, 10);
    mouse.up(20, 20);

    expect(h.state.activeTool.type).toBe("rectangle");
  });

  it("should set custom tool", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "custom", customType: "comment" });
    });
    expect(h.state.activeTool.type).toBe("custom");
    expect(h.state.activeTool.customType).toBe("comment");
  });

  it("hides canvas hints while the selection picker is open", () => {
    const selectionTrigger = document.querySelector<HTMLElement>(
      '.App-toolbar [data-testid="toolbar-selection"]',
    );

    expect(selectionTrigger).not.toBeNull();
    expect(document.querySelector(".HintViewer")).not.toBeNull();

    fireEvent.pointerDown(selectionTrigger!);

    expect(document.querySelector(".tool-popover-content")).not.toBeNull();
    expect(document.querySelector(".HintViewer")).toBeNull();

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    expect(document.querySelector(".tool-popover-content")).toBeNull();
    expect(document.querySelector(".HintViewer")).not.toBeNull();

    fireEvent.pointerDown(selectionTrigger!);

    expect(document.querySelector(".tool-popover-content")).not.toBeNull();
    expect(document.querySelector(".HintViewer")).toBeNull();

    fireEvent.pointerDown(selectionTrigger!);

    expect(document.querySelector(".tool-popover-content")).toBeNull();
    expect(document.querySelector(".HintViewer")).not.toBeNull();

    fireEvent.pointerDown(selectionTrigger!);

    const selectionPopover = document.querySelector(".tool-popover-content");
    const lassoOption = selectionPopover?.querySelector<HTMLElement>(
      '[data-testid="toolbar-lasso"]',
    );

    expect(lassoOption).not.toBeNull();

    fireEvent.click(lassoOption!);
    expect(h.state.activeTool.type).toBe("lasso");
    expect(document.querySelector(".tool-popover-content")).toBeNull();

    const lassoTrigger = document.querySelector<HTMLElement>(
      '.App-toolbar [data-testid="toolbar-selection"]',
    );

    expect(lassoTrigger).not.toBeNull();

    fireEvent.pointerDown(lassoTrigger!);

    const selectionOption = document.querySelector<HTMLElement>(
      '.tool-popover-content [data-testid="toolbar-selection"]',
    );

    expect(selectionOption).not.toBeNull();

    fireEvent.click(selectionOption!);
    expect(h.state.activeTool.type).toBe("selection");
    expect(document.querySelector(".tool-popover-content")).toBeNull();
    expect(document.querySelector(".HintViewer")).not.toBeNull();

    const restoredSelectionTrigger = document.querySelector<HTMLElement>(
      '.App-toolbar [data-testid="toolbar-selection"]',
    );

    fireEvent.pointerDown(restoredSelectionTrigger!);

    mouse.down(10, 10);
    mouse.up(10, 10);

    expect(document.querySelector(".tool-popover-content")).toBeNull();
    expect(document.querySelector(".HintViewer")).not.toBeNull();

    const finalSelectionTrigger = document.querySelector<HTMLElement>(
      '.App-toolbar [data-testid="toolbar-selection"]',
    );

    fireEvent.pointerDown(finalSelectionTrigger!);
    expect(document.querySelector(".tool-popover-content")).not.toBeNull();

    const consoleErrorSpy = vi.spyOn(console, "error");
    unmountApp();
    const hasStateUpdateWarning = consoleErrorSpy.mock.calls.some(([message]) =>
      /cannot update|state update/i.test(String(message)),
    );
    consoleErrorSpy.mockRestore();

    expect(hasStateUpdateWarning).toBe(false);
  });
});
describe("getToolbarTools()", () => {
  const getToolValues = (preferredSelectionTool: "selection" | "lasso") =>
    getToolbarTools({
      state: {
        preferredSelectionTool: {
          type: preferredSelectionTool,
        },
      },
    } as AppClassProperties).map((tool) => tool.value);

  it("does not include lasso when selection is preferred", () => {
    const toolValues = getToolValues("selection");

    expect(toolValues.filter((value) => value === "selection")).toHaveLength(1);
    expect(toolValues.filter((value) => value === "lasso")).toHaveLength(0);
  });

  it("replaces selection with lasso when lasso is preferred", () => {
    const toolValues = getToolValues("lasso");

    expect(toolValues.filter((value) => value === "lasso")).toHaveLength(1);
    expect(toolValues.filter((value) => value === "selection")).toHaveLength(0);
  });
});
