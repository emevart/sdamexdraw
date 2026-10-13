import React from "react";

import { ELEMENT_TRANSLATE_AMOUNT, KEYS, reseed } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw, reconcileElements } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

import type { RemoteExcalidrawElement } from "../data/reconcile";

const { h } = window;

/**
 * Remote delivery the way the SdamEx host applies it: reconcileElements
 * against the local scene, then updateScene with CaptureUpdateAction.NEVER
 * (excalidraw-canvas.tsx, Yjs observer and peer-preview paths).
 */
const deliverRemote = (remote: readonly unknown[]) => {
  const reconciled = reconcileElements(
    h.app.scene.getElementsIncludingDeleted(),
    remote as RemoteExcalidrawElement[],
    h.state,
  );
  API.updateScene({
    elements: reconciled,
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

const mouse = new Pointer("mouse");

/**
 * Draws with the rectangle tool, as a user does (the creation is the history
 * entry Ctrl+Z used to undo instead of the move); the shape stays selected.
 */
const drawRect = () => {
  act(() => h.app.setActiveTool({ type: "rectangle" }));
  mouse.downAt(100, 100);
  mouse.moveTo(130, 130);
  mouse.moveTo(150, 150);
  mouse.upAt(150, 150);
  const el = h.elements[h.elements.length - 1];
  expect(el.isDeleted).toBe(false);
  expect(h.state.selectedElementIds[el.id]).toBe(true);
  return { id: el.id, get: () => h.elements.find((e) => e.id === el.id)! };
};

const peerRect = (id: string, x: number) =>
  API.createElement({
    type: "rectangle",
    id,
    x,
    y: 300,
    width: 20,
    height: 20,
  });

describe("arrow-key moves in history with collab traffic (sdamex #5050)", () => {
  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("drawn shape: remote updates between presses keep each move undoable", () => {
    const rect = drawRect();
    const x0 = rect.get().x;

    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    deliverRemote([peerRect("peer-1", 400)]);
    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    deliverRemote([peerRect("peer-2", 500)]);

    expect(rect.get().x).toBe(x0 + 2 * ELEMENT_TRANSLATE_AMOUNT);

    Keyboard.undo();
    expect(rect.get().x).toBe(x0 + ELEMENT_TRANSLATE_AMOUNT);
    expect(rect.get().isDeleted).toBe(false);
    Keyboard.undo();
    expect(rect.get().x).toBe(x0);
    expect(rect.get().isDeleted).toBe(false);
    // remote elements are never part of local history
    expect(h.elements.find((el) => el.id === "peer-1")?.isDeleted).toBe(false);
  });

  it("held key: a remote update during the hold does not swallow the move", () => {
    const rect = drawRect();
    const x0 = rect.get().x;

    Keyboard.keyDown(KEYS.ARROW_RIGHT);
    Keyboard.keyDown(KEYS.ARROW_RIGHT);
    deliverRemote([peerRect("peer-1", 400)]);
    Keyboard.keyDown(KEYS.ARROW_RIGHT);
    Keyboard.keyUp(KEYS.ARROW_RIGHT);

    expect(rect.get().x).toBe(x0 + 3 * ELEMENT_TRANSLATE_AMOUNT);

    Keyboard.undo();
    expect(rect.get().x).toBe(x0);
    expect(rect.get().isDeleted).toBe(false);
  });

  it("a stale echo of the moved shape mid-hold is discarded", () => {
    const rect = drawRect();
    const x0 = rect.get().x;

    // a peer re-broadcasts our pre-move copy: older version, the local one wins
    const stale = { ...rect.get() };
    Keyboard.keyDown(KEYS.ARROW_RIGHT);
    deliverRemote([stale]);
    Keyboard.keyUp(KEYS.ARROW_RIGHT);
    expect(rect.get().x).toBe(x0 + ELEMENT_TRANSLATE_AMOUNT);

    Keyboard.undo();
    expect(rect.get().x).toBe(x0);
    expect(rect.get().isDeleted).toBe(false);
  });
});
