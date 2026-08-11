import React from "react";
import { vi } from "vitest";

import { MQ_MIN_WIDTH_DESKTOP } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import {
  GlobalTestState,
  fireEvent,
  render,
  unmountComponent,
} from "./test-utils";

// Гонка быстрого ПКМ-флика (регресс 0.28.5, репро founder 2026-07-13):
// pan-onPointerMove обёрнут в throttleRAF; при быстром флике pointerup
// приходит раньше кадра — teardown сбрасывает isPanning и уже ПОСЛЕ этого
// onPointerMove.flush() исполняет отложенный move, чья активация ставит
// isPanning = true навсегда. Дальше каждый canvas-pointerdown глотается
// ранним return (рисование/выделение/пан мертвы до перезагрузки), при этом
// contextmenu-путь жив — сигнатура с видео-репро.
//
// Глобальный мок setupTests делает throttleRAF синхронным (flush = no-op) и
// структурно скрывает эту гонку — здесь возвращаем настоящую реализацию.
// jsdom-овский rAF таймерный и в синхронной серии fireEvent не успевает
// сработать — ровно тайминг реального быстрого флика.
vi.mock("@excalidraw/common", async (importOriginal) => {
  return await importOriginal();
});

const { h } = window;

const pointerEvent = (overrides: object) => ({
  pointerId: 71,
  pointerType: "mouse",
  button: 2,
  buttons: 2,
  clientX: 300,
  clientY: 300,
  ...overrides,
});

beforeEach(async () => {
  unmountComponent();
  localStorage.clear();

  await render(<Excalidraw handleKeyboardGlobally={true} />);
  API.setAppState({ height: 768, width: MQ_MIN_WIDTH_DESKTOP });
});

describe("fast right-flick pan race (throttled move flushed after teardown)", () => {
  it("canvas stays interactive after a flick released before the rAF tick", () => {
    const canvas = GlobalTestState.interactiveCanvas;
    const scroll0 = h.state.scrollX;

    // Быстрый флик: down -> move за порог -> up в одной синхронной серии,
    // отложенный move исполняется только через flush() внутри teardown.
    fireEvent.pointerDown(canvas, pointerEvent({}));
    fireEvent.pointerMove(window, pointerEvent({ clientX: 380, clientY: 380 }));
    fireEvent.pointerUp(window, pointerEvent({ clientX: 380, clientY: 380 }));
    fireEvent.contextMenu(canvas, pointerEvent({ clientX: 380, clientY: 380 }));

    // Флик — это всё же пан: дельта применена, меню подавлено.
    expect(h.state.scrollX).not.toBe(scroll0);
    expect(h.state.contextMenu).toBeNull();

    // Живость: следующий левый pointerdown должен дойти до обычного пути
    // (cursorButton выставляется строго ПОСЛЕ раннего return по isPanning).
    fireEvent.pointerDown(
      canvas,
      pointerEvent({ button: 0, buttons: 1, clientX: 200, clientY: 200 }),
    );
    expect(h.state.cursorButton).toBe("down");
    fireEvent.pointerUp(
      canvas,
      pointerEvent({ button: 0, buttons: 0, clientX: 200, clientY: 200 }),
    );
  });
});
