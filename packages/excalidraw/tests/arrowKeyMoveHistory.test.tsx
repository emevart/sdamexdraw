import React from "react";

import { ELEMENT_TRANSLATE_AMOUNT, KEYS, reseed } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

const { h } = window;

const rect = () => h.elements.find((element) => element.id === "rect")!;

describe("arrow-key moves in history (sdamex #5050)", () => {
  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    API.updateScene({
      elements: [
        API.createElement({
          type: "rectangle",
          id: "rect",
          x: 100,
          y: 100,
          width: 50,
          height: 50,
        }),
      ],
      appState: { selectedElementIds: { rect: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  });

  it("records one entry per press and undo moves the shape back", () => {
    const entries = API.getUndoStack().length;

    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    expect(rect().x).toBe(100 + ELEMENT_TRANSLATE_AMOUNT);
    expect(API.getUndoStack().length).toBe(entries + 1);

    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    expect(API.getUndoStack().length).toBe(entries + 2);

    Keyboard.undo();
    expect(rect().x).toBe(100 + ELEMENT_TRANSLATE_AMOUNT);
    Keyboard.undo();
    expect(rect().x).toBe(100);
    expect(rect().isDeleted).toBe(false);
  });

  it("a held key (auto-repeat) is a single entry", () => {
    const entries = API.getUndoStack().length;

    Keyboard.keyDown(KEYS.ARROW_DOWN);
    Keyboard.keyDown(KEYS.ARROW_DOWN);
    Keyboard.keyDown(KEYS.ARROW_DOWN);
    Keyboard.keyUp(KEYS.ARROW_DOWN);

    expect(rect().y).toBe(100 + 3 * ELEMENT_TRANSLATE_AMOUNT);
    expect(API.getUndoStack().length).toBe(entries + 1);

    Keyboard.undo();
    expect(rect().y).toBe(100);
    expect(rect().isDeleted).toBe(false);
  });

  it("arrow keys without a selection record nothing", () => {
    API.updateScene({
      appState: { selectedElementIds: {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    const entries = API.getUndoStack().length;

    Keyboard.keyPress(KEYS.ARROW_LEFT);

    expect(API.getUndoStack().length).toBe(entries);
    expect(rect().x).toBe(100);
  });
});
