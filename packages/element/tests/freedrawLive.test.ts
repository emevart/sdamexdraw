import type { LocalPoint } from "@excalidraw/math";

import {
  releaseFreedrawLiveInk,
  renderFreedrawLiveInk,
} from "../src/freedrawLive";
import { setFreedrawPenInk } from "../src/shape";

import { freedrawElement } from "./helpers/penStrokes";

// sdamex #5706: pen ink v2 draws a stroke being drawn onto the canvas of the
// new element (renderNewElementScene); App's rough canvas belongs to the
// static scene

type CanvasEvent = { type: string; props: { value?: unknown } };
const eventsOf = (canvas: HTMLCanvasElement): CanvasEvent[] =>
  (
    canvas.getContext("2d") as unknown as { __getEvents(): CanvasEvent[] }
  ).__getEvents();

const attachedCanvas = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  document.body.appendChild(canvas);
  return canvas;
};

/** A closed loop: 200 points round a circle, the last one on the first. */
const loop = (backgroundColor = "#ff0000") => {
  const points: LocalPoint[] = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * 2 * Math.PI;
    points.push([
      Math.round(40 * Math.cos(a)) - 40,
      Math.round(40 * Math.sin(a)),
    ] as LocalPoint);
  }
  return freedrawElement(
    points,
    points.map(() => 0.2),
    { x: 120, y: 100, backgroundColor, fillStyle: "solid" },
  );
};

beforeAll(() => {
  setFreedrawPenInk("v2");
});
afterAll(() => {
  setFreedrawPenInk("legacy");
});
afterEach(() => {
  releaseFreedrawLiveInk();
  document.body.innerHTML = "";
});

describe("pen ink v2: the canvas of the stroke being drawn", () => {
  it("fills a closed stroke on that canvas, not on the static scene", () => {
    const staticCanvas = attachedCanvas();
    const newElementCanvas = attachedCanvas();
    const context = newElementCanvas.getContext("2d")!;

    renderFreedrawLiveInk({
      element: loop(),
      context,
      scale: 1,
      zoom: 1,
      scrollX: 10,
      scrollY: 20,
      theme: "light",
      opacity: 1,
    });

    const fills = (canvas: HTMLCanvasElement) =>
      eventsOf(canvas).filter(
        (event) =>
          event.type === "fillStyle" && event.props.value === "#ff0000",
      ).length;
    expect(fills(newElementCanvas)).toBeGreaterThan(0);
    expect(eventsOf(staticCanvas)).toEqual([]);
  });

  it("builds nothing for a frame left after the stroke ended", () => {
    const canvas = attachedCanvas();
    const context = canvas.getContext("2d")!;
    const frame = {
      element: loop("transparent"),
      context,
      scale: 2,
      zoom: 1,
      scrollX: 10,
      scrollY: 20,
      theme: "light" as const,
      opacity: 1,
    };
    renderFreedrawLiveInk(frame);
    expect(eventsOf(canvas).some((event) => event.type === "drawImage")).toBe(
      true,
    );

    // the stroke ends: React removes the canvas of the new element and
    // releases the ink; a frame queued with requestAnimationFrame (throttled
    // rendering) still comes for the removed canvas
    canvas.remove();
    releaseFreedrawLiveInk();
    (context as unknown as { __clearEvents(): void }).__clearEvents();
    renderFreedrawLiveInk(frame);

    // no stroke state and no layer of the size of the canvas until the next
    // stroke: nothing is drawn
    expect(eventsOf(canvas)).toEqual([]);
  });
});
