import React from "react";

import { reseed } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { History } from "../history";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

const { h } = window;

// one history entry per call; the fork's compact toolbar has no
// `toolbar-rectangle` button, so UI.createElement() can't be used here
const addRectangles = (count: number) => {
  for (let index = 0; index < count; index++) {
    API.updateScene({
      elements: [
        ...h.elements,
        API.createElement({
          type: "rectangle",
          id: `rect-${index}`,
          x: index * 40,
        }),
      ],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }
};

const liveIds = () =>
  h.elements.filter((element) => !element.isDeleted).map(({ id }) => id);

describe("history limit (sdamex)", () => {
  const defaultMaxEntries = History.maxEntries;

  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  afterEach(() => {
    History.maxEntries = defaultMaxEntries;
  });

  it("defaults to 300 entries", () => {
    expect(defaultMaxEntries).toBe(300);
  });

  it("drops the oldest undo entries beyond maxEntries", () => {
    History.maxEntries = 3;

    addRectangles(5);

    expect(API.getUndoStack().length).toBe(3);

    Keyboard.undo();
    Keyboard.undo();
    Keyboard.undo();
    Keyboard.undo();

    // the two oldest additions can no longer be undone
    expect(liveIds()).toEqual(["rect-0", "rect-1"]);
  });

  it("trims the undo stack when redo pushes past maxEntries", () => {
    addRectangles(5);
    expect(API.getUndoStack().length).toBe(5);

    Keyboard.undo();
    History.maxEntries = 3;
    Keyboard.redo();

    expect(API.getUndoStack().length).toBe(3);
    expect(liveIds()).toHaveLength(5);
  });

  it("trims the redo stack when undo pushes past maxEntries", () => {
    addRectangles(5);
    for (let index = 0; index < 5; index++) {
      Keyboard.undo();
    }
    expect(API.getRedoStack().length).toBe(5);
    expect(liveIds()).toEqual([]);

    History.maxEntries = 3;
    Keyboard.redo();
    Keyboard.undo();

    expect(API.getRedoStack().length).toBe(3);
  });
});
