import React from "react";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import {
  act,
  fireEvent,
  GlobalTestState,
  render,
  unmountComponent,
} from "./test-utils";

const { h } = window;

/**
 * emevart/billion-dollars#6907: касание пальцем и выделение.
 *
 * 1. Pinch двумя пальцами снимал выделение только что вставленной картинки:
 *    `onTouchStart` с двумя касаниями обнулял `selectedElementIds`, а
 *    `onTouchEnd` возвращал `previousSelectedElementIds` только если палец
 *    остался на стекле (и в pen mode этот снимок вообще не обновлялся).
 * 2. В pen mode короткий тап пальцем по элементу при инструменте «указатель»
 *    не выделял его (палец -- камера), выделяло только долгое нажатие через
 *    контекстное меню.
 *
 * Поток событий -- как на iOS: pointerdown раньше touchstart, pointerup
 * раньше touchend.
 */

const directTouch = (identifier: number, clientX: number, clientY: number) =>
  ({ identifier, clientX, clientY, touchType: "direct" } as unknown as Touch);

type Pt = { x: number; y: number };

class Pinch {
  private p1: Pointer;
  private p2: Pointer;

  constructor(private a: Pt, private b: Pt, ids: [number, number] = [21, 22]) {
    this.p1 = new Pointer("touch", ids[0]);
    this.p2 = new Pointer("touch", ids[1]);
  }

  private touches() {
    return [
      directTouch(1, this.a.x, this.a.y),
      directTouch(2, this.b.x, this.b.y),
    ];
  }

  private fireTouch(type: "touchStart" | "touchMove") {
    const touches = this.touches();
    fireEvent[type](GlobalTestState.interactiveCanvas, {
      touches,
      changedTouches: touches,
    });
  }

  start() {
    this.p1.downAt(this.a.x, this.a.y);
    fireEvent.touchStart(GlobalTestState.interactiveCanvas, {
      touches: [directTouch(1, this.a.x, this.a.y)],
      changedTouches: [directTouch(1, this.a.x, this.a.y)],
    });
    this.p2.downAt(this.b.x, this.b.y);
    this.fireTouch("touchStart");
    this.fireTouch("touchMove");
  }

  /** пальцы расходятся: масштаб растёт */
  spread(d: number) {
    this.a = { x: this.a.x - d, y: this.a.y };
    this.b = { x: this.b.x + d, y: this.b.y };
    this.p1.moveTo(this.a.x, this.a.y);
    this.p2.moveTo(this.b.x, this.b.y);
    this.fireTouch("touchMove");
  }

  /** оба пальца отрываются в одном кадре (один touchend без касаний) */
  endTogether() {
    this.p1.upAt(this.a.x, this.a.y);
    this.p2.upAt(this.b.x, this.b.y);
    fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
      touches: [],
      changedTouches: this.touches(),
    });
  }

  /** пальцы отрываются по очереди: сначала второй, потом первый */
  endOneByOne() {
    this.p2.upAt(this.b.x, this.b.y);
    fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
      touches: [directTouch(1, this.a.x, this.a.y)],
      changedTouches: [directTouch(2, this.b.x, this.b.y)],
    });
    this.p1.upAt(this.a.x, this.a.y);
    fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
      touches: [],
      changedTouches: [directTouch(1, this.a.x, this.a.y)],
    });
  }
}

const finger = new Pointer("touch", 31);

const tap = (x: number, y: number) => {
  finger.downAt(x, y);
  fireEvent.touchStart(GlobalTestState.interactiveCanvas, {
    touches: [directTouch(5, x, y)],
    changedTouches: [directTouch(5, x, y)],
  });
  finger.upAt(x, y);
  fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
    touches: [],
    changedTouches: [directTouch(5, x, y)],
  });
};

const createImage = () =>
  API.createElement({
    type: "image",
    x: 100,
    y: 100,
    width: 200,
    height: 150,
  });

const selectTool = (type: "selection" | "freedraw") => {
  act(() => {
    h.app.setActiveTool({ type });
  });
};

const selectedIds = () =>
  Object.keys(h.state.selectedElementIds).filter(
    (id) => h.state.selectedElementIds[id],
  );

const expectOnlySelected = (element: ExcalidrawElement) => {
  expect(selectedIds()).toEqual([element.id]);
};

const resetGestureState = () => {
  // модульное состояние двойного тапа живёт между тестами: без сброса первый
  // тап сценария засчитывается вторым тапом предыдущего
  (
    h.app.constructor as unknown as { resetTapTwice: () => void }
  ).resetTapTwice();
  fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
    touches: [],
    changedTouches: [],
  });
};

describe.each([
  ["pen mode", true],
  ["без пера", false],
])("#6907 pinch не меняет выделение (%s)", (_label, penMode) => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    resetGestureState();
    API.setAppState({ penMode, penDetected: penMode });
    selectTool("selection");
  });

  it("пальцы вне картинки, отрыв одновременно", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);
    const zoomBefore = h.state.zoom.value;

    const pinch = new Pinch({ x: 500, y: 500 }, { x: 600, y: 500 });
    pinch.start();
    expectOnlySelected(image);
    pinch.spread(30);
    pinch.spread(30);
    expectOnlySelected(image);
    pinch.endTogether();

    expect(h.state.zoom.value).not.toBe(zoomBefore);
    expectOnlySelected(image);
  });

  it("пальцы вне картинки, отрыв по очереди", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);

    const pinch = new Pinch({ x: 500, y: 500 }, { x: 600, y: 500 });
    pinch.start();
    pinch.spread(30);
    pinch.spread(30);
    pinch.endOneByOne();

    expectOnlySelected(image);
  });

  it("первый палец на картинке: выделение остаётся, картинка не едет", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);
    const xBefore = h.elements[0].x;
    const yBefore = h.elements[0].y;

    const pinch = new Pinch({ x: 200, y: 170 }, { x: 450, y: 170 });
    pinch.start();
    pinch.spread(30);
    pinch.spread(30);
    expectOnlySelected(image);
    pinch.endTogether();

    expectOnlySelected(image);
    expect(h.elements[0].x).toBe(xBefore);
    expect(h.elements[0].y).toBe(yBefore);
  });

  it("pinch без выделения ничего не выделяет", () => {
    const image = createImage();
    API.setElements([image]);

    const pinch = new Pinch({ x: 200, y: 170 }, { x: 450, y: 170 });
    pinch.start();
    pinch.spread(30);
    pinch.endTogether();

    expect(selectedIds()).toEqual([]);
  });
});

describe("#6907 короткий тап указателем выделяет элемент", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    resetGestureState();
  });

  it("pen mode: тап пальцем по картинке выделяет её сразу", () => {
    API.setAppState({ penMode: true, penDetected: true });
    selectTool("selection");
    const image = createImage();
    API.setElements([image]);

    tap(200, 170);

    expectOnlySelected(image);
  });

  it("pen mode: тап по другой картинке переносит выделение", () => {
    API.setAppState({ penMode: true, penDetected: true });
    selectTool("selection");
    const first = createImage();
    const second = API.createElement({
      type: "image",
      x: 400,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([first, second]);
    API.setSelectedElements([first]);

    tap(450, 150);

    expectOnlySelected(second);
  });

  it("pen mode: тап по пустому месту по-прежнему снимает выделение", () => {
    API.setAppState({ penMode: true, penDetected: true });
    selectTool("selection");
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);

    tap(600, 600);

    expect(selectedIds()).toEqual([]);
  });

  it("pen mode, инструмент «перо»: тап пальцем по картинке не выделяет", () => {
    API.setAppState({ penMode: true, penDetected: true });
    selectTool("freedraw");
    const image = createImage();
    API.setElements([image]);

    tap(200, 170);

    expect(selectedIds()).toEqual([]);
  });

  it("без пера: тап пальцем по картинке выделяет её (контроль)", () => {
    selectTool("selection");
    const image = createImage();
    API.setElements([image]);

    tap(200, 170);

    expectOnlySelected(image);
  });

  it("мышь: клик по картинке выделяет, клик по пустому снимает (контроль)", () => {
    selectTool("selection");
    const image = createImage();
    API.setElements([image]);
    const mouse = new Pointer("mouse");

    mouse.clickAt(200, 170);
    expectOnlySelected(image);

    mouse.clickAt(600, 600);
    expect(selectedIds()).toEqual([]);
  });
});

const stylusTouch = (x: number, y: number) =>
  ({
    identifier: 9,
    clientX: x,
    clientY: y,
    touchType: "stylus",
  } as unknown as Touch);

/** касание Apple Pencil: pointer "pen" + touch-события с touchType "stylus" */
const penTap = (x: number, y: number) => {
  const pen = new Pointer("pen", 41);
  pen.downAt(x, y);
  fireEvent.touchStart(GlobalTestState.interactiveCanvas, {
    touches: [stylusTouch(x, y)],
    changedTouches: [stylusTouch(x, y)],
  });
  pen.upAt(x, y);
  fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
    touches: [],
    changedTouches: [stylusTouch(x, y)],
  });
};

describe("#6907 снимок выделения не переживает жест", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    resetGestureState();
    API.setAppState({ penMode: true, penDetected: true });
    selectTool("selection");
  });

  const twoImages = () => {
    const first = createImage();
    const second = API.createElement({
      type: "image",
      x: 400,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([first, second]);
    API.setSelectedElements([first]);
    return [first, second] as const;
  };

  it("отмена двумя пальцами, затем перо выделяет другую картинку", () => {
    const [, second] = twoImages();

    // двойной тап двумя пальцами -- undo; ветка undo выходит из onTouchEnd
    for (let i = 0; i < 2; i++) {
      const twoFingerTap = new Pinch({ x: 600, y: 500 }, { x: 700, y: 500 });
      twoFingerTap.start();
      twoFingerTap.endTogether();
    }

    penTap(450, 150);

    expectOnlySelected(second);
  });

  it("touchcancel, затем перо выделяет другую картинку", () => {
    const [, second] = twoImages();

    const pinch = new Pinch({ x: 600, y: 500 }, { x: 700, y: 500 });
    pinch.start();
    pinch.spread(30);
    // система отменила жест: touchend не придёт
    fireEvent.touchCancel(GlobalTestState.interactiveCanvas, {
      touches: [],
      changedTouches: [],
    });
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    Pointer.resetAll();

    penTap(450, 150);

    expectOnlySelected(second);
  });

  it("Safari gesturestart во время pinch не снимает выделение", () => {
    const [first] = twoImages();

    const pinch = new Pinch({ x: 600, y: 500 }, { x: 700, y: 500 });
    pinch.start();
    act(() => {
      document.dispatchEvent(new Event("gesturestart"));
    });

    expectOnlySelected(first);
    pinch.endTogether();
    expectOnlySelected(first);
  });

  it("тап пальцем внутри редактируемой группы не выходит из неё", () => {
    const a = API.createElement({
      type: "image",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      groupIds: ["g"],
    });
    const b = API.createElement({
      type: "image",
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      groupIds: ["g"],
    });
    API.setElements([a, b]);
    API.setAppState({
      editingGroupId: "g",
      selectedElementIds: { [a.id]: true },
      selectedGroupIds: {},
    });

    // перо предыдущего теста было только что: защита от ладони
    const later = Date.now() + 10_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    tap(350, 150);
    vi.restoreAllMocks();

    expect(h.state.editingGroupId).toBe("g");
    expectOnlySelected(b);
  });
});

describe("#6907 защита от ладони: тап пальцем в pen mode", () => {
  let now = 0;

  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    Pointer.resetAll();
    resetGestureState();
    API.setAppState({ penMode: true, penDetected: true });
    selectTool("selection");
    // модульная метка последнего касания пером живёт между тестами:
    // начинаем заведомо позже неё (и позже часов предыдущего теста)
    now = Math.max(now, Date.now()) + 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** штрих пером по пустому месту, затем перо в воздухе */
  const penStroke = () => {
    const pen = new Pointer("pen", 42);
    pen.downAt(600, 600);
    pen.moveTo(640, 620);
    pen.upAt(640, 620);
  };

  /** касание с геометрией пятна: PointerEvent width/height, Touch radiusX/Y */
  const sizedTap = (
    x: number,
    y: number,
    size: { width?: number; height?: number; radius?: number },
  ) => {
    const pointer = {
      clientX: x,
      clientY: y,
      pointerType: "touch",
      pointerId: 33,
      width: size.width,
      height: size.height,
    };
    const touch = {
      identifier: 7,
      clientX: x,
      clientY: y,
      touchType: "direct",
      radiusX: size.radius,
      radiusY: size.radius,
    } as unknown as Touch;
    fireEvent.pointerDown(GlobalTestState.interactiveCanvas, pointer);
    fireEvent.touchStart(GlobalTestState.interactiveCanvas, {
      touches: [touch],
      changedTouches: [touch],
    });
    fireEvent.pointerUp(GlobalTestState.interactiveCanvas, pointer);
    fireEvent.touchEnd(GlobalTestState.interactiveCanvas, {
      touches: [],
      changedTouches: [touch],
    });
  };

  it("ладонь через 200 мс после пера не выделяет", () => {
    const image = createImage();
    API.setElements([image]);

    penStroke();
    now += 200;
    tap(200, 170);

    expect(selectedIds()).toEqual([]);
  });

  it("палец через 800 мс после пера выделяет", () => {
    const image = createImage();
    API.setElements([image]);

    penStroke();
    now += 800;
    tap(200, 170);

    expectOnlySelected(image);
  });

  it("широкое пятно PointerEvent (ладонь) не выделяет", () => {
    const image = createImage();
    API.setElements([image]);

    sizedTap(200, 170, { width: 120, height: 120 });

    expect(selectedIds()).toEqual([]);
  });

  it("широкое пятно Touch.radiusX (ладонь) не выделяет", () => {
    const image = createImage();
    API.setElements([image]);

    sizedTap(200, 170, { radius: 60 });

    expect(selectedIds()).toEqual([]);
  });

  it("маленькое пятно пальца выделяет", () => {
    const image = createImage();
    API.setElements([image]);

    sizedTap(200, 170, { width: 30, height: 30, radius: 15 });

    expectOnlySelected(image);
  });
});
