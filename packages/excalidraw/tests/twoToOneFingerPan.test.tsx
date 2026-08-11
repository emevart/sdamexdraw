import React from "react";

import { Excalidraw } from "../index";

import { Pointer } from "./helpers/ui";
import {
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  waitFor,
} from "./test-utils";

const { h } = window;

/**
 * Репро жеста, о котором сообщил founder на iPad: двумя пальцами холст
 * двигается, но стоит оторвать один -- движение прекращается, хотя обратный
 * порядок (один палец -> два) работает.
 */
describe("распад жеста с двух пальцев до одного", () => {
  beforeEach(() => {
    mockBoundingClientRect();
  });

  afterEach(() => {
    restoreOriginalGetBoundingClientRect();
  });

  it("контроль: 'рука' + один палец панорамирует", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    React.act(() => {
      h.app.setActiveTool({ type: "hand" });
    });
    expect(h.state.activeTool.type).toBe("hand");

    const finger = new Pointer("touch", 1);
    const start = { x: h.state.scrollX, y: h.state.scrollY };

    finger.downAt(50, 50);
    finger.move(10, 10);

    expect({ x: h.state.scrollX, y: h.state.scrollY }).not.toEqual(start);

    finger.up();
  });

  it("инструмент 'рука': оставшийся палец продолжает панорамировать", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    React.act(() => {
      h.app.setActiveTool({ type: "hand" });
    });

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    const startScrollX = h.state.scrollX;
    const startScrollY = h.state.scrollY;

    // два пальца вниз и вправо -- холст едет
    finger1.downAt(50, 50);
    finger2.downAt(70, 50);
    finger1.move(10, 10);
    finger2.move(10, 10);

    const afterTwoFingers = {
      x: h.state.scrollX,
      y: h.state.scrollY,
    };
    expect(afterTwoFingers).not.toEqual({ x: startScrollX, y: startScrollY });

    // отрываем второй палец -- сессия панорамирования принадлежит первому
    finger2.up();

    // и продолжаем движение одним
    finger1.move(10, 10);

    expect({ x: h.state.scrollX, y: h.state.scrollY }).not.toEqual(
      afterTwoFingers,
    );

    finger1.up();
  });

  it("инструмент 'выделение': оставшийся палец тоже панорамирует", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    finger1.downAt(50, 50);
    finger2.downAt(70, 50);
    finger1.move(10, 10);
    finger2.move(10, 10);

    const afterTwoFingers = {
      x: h.state.scrollX,
      y: h.state.scrollY,
    };

    finger2.up();
    finger1.move(10, 10);

    expect({ x: h.state.scrollX, y: h.state.scrollY }).not.toEqual(
      afterTwoFingers,
    );

    finger1.up();
  });

  it("freedraw: оставшийся палец двигает холст и НЕ рисует", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    React.act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    finger1.downAt(50, 50);
    finger2.downAt(70, 50);
    finger1.move(10, 10);
    finger2.move(10, 10);

    // появление второго пальца отменяет начатый штрих
    expect(h.elements).toHaveLength(0);

    const afterTwoFingers = { x: h.state.scrollX, y: h.state.scrollY };

    finger2.up();
    finger1.move(10, 10);

    expect({ x: h.state.scrollX, y: h.state.scrollY }).not.toEqual(
      afterTwoFingers,
    );
    // и штрих не воскресает
    expect(h.elements).toHaveLength(0);

    finger1.up();
    expect(h.elements).toHaveLength(0);
  });

  it("после полного отрыва рисование снова работает", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    await waitFor(() => expect(h.state.width).toBe(200));

    React.act(() => {
      h.app.setActiveTool({ type: "freedraw" });
    });

    const finger1 = new Pointer("touch", 1);
    const finger2 = new Pointer("touch", 2);

    finger1.downAt(50, 50);
    finger2.downAt(70, 50);
    finger1.move(10, 10);
    finger2.up();
    finger1.move(10, 10);
    finger1.up();

    // новый контакт после жеста -- обычный штрих
    const finger3 = new Pointer("touch", 3);
    finger3.downAt(40, 40);
    finger3.move(5, 5);
    finger3.move(5, 5);
    finger3.up();

    expect(h.elements).toHaveLength(1);
    expect(h.elements[0].type).toBe("freedraw");
  });
});
