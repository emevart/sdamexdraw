// sdamex #5706: drawing a pen stroke while it is being drawn (pen ink v2).
//
// 0.30.9 and 0.30.10 rebuilt the outline of the whole stroke, its SVG string,
// a Path2D and a new element canvas on every frame: O(n) per frame, O(n^2)
// per stroke, and the ink fell behind the pen as a long stroke grew. Here the
// finished part of the stroke (FreedrawLiveInk) is filled once, piece by
// piece, into a layer canvas in device pixels; a frame draws the layer and
// fills only the rest of the stroke. The layer is redrawn from the pieces
// when the zoom, scroll, size or color changes mid-stroke. After pointerup
// the stroke is drawn from its cached full ink like any other element.

import rough from "roughjs/bin/rough";

import { THEME, applyDarkModeFilter, isTransparent } from "@excalidraw/common";

import type { AppState } from "@excalidraw/excalidraw/types";

import { FreedrawLiveInk, writeFreedrawOutlinePath } from "./freedrawInk";
import { getFreedrawBackgroundShape } from "./shape";

import type { ExcalidrawFreeDrawElement } from "./types";

import type { RoughCanvas } from "roughjs/bin/canvas";

type LiveStroke = {
  element: ExcalidrawFreeDrawElement;
  ink: FreedrawLiveInk;
  paths: Path2D[];
  /** device px box of the pieces in the layer: x1, y1, x2, y2 */
  box: [number, number, number, number];
  /** rough canvas of the canvas the stroke is drawn on (closed fills) */
  rough: { target: HTMLCanvasElement; canvas: RoughCanvas } | null;
};

type Layer = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  owner: LiveStroke | null;
  key: string;
  drawn: number;
};

let stroke: LiveStroke | null = null;
let layer: Layer | null = null;

const getLayer = (): Layer | null => {
  if (!layer) {
    if (typeof document === "undefined") {
      return null;
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    layer = { canvas, context, owner: null, key: "", drawn: 0 };
  }
  return layer;
};

/** Drops the stroke state and frees the layer (a stroke ended). */
export const releaseFreedrawLiveInk = () => {
  stroke = null;
  if (layer) {
    layer.canvas.width = 0;
    layer.canvas.height = 0;
    layer.owner = null;
    layer.key = "";
    layer.drawn = 0;
  }
};

const extendBox = (
  box: LiveStroke["box"],
  outline: readonly number[],
  scale: number,
  offsetX: number,
  offsetY: number,
) => {
  for (let i = 0; i < outline.length; i += 2) {
    const x = (outline[i] + offsetX) * scale;
    const y = (outline[i + 1] + offsetY) * scale;
    if (x < box[0]) {
      box[0] = x;
    }
    if (y < box[1]) {
      box[1] = y;
    }
    if (x > box[2]) {
      box[2] = x;
    }
    if (y > box[3]) {
      box[3] = y;
    }
  }
};

/**
 * Draws a solid pen stroke that is being drawn onto `context`, the canvas of
 * the new element, which holds nothing else: the transform is the one of
 * renderNewElementScene (device pixel ratio, then zoom). `opacity` is the
 * render opacity of the element; it is applied once to the whole canvas so
 * the overlapping ends of the pieces do not show.
 */
export const renderFreedrawLiveInk = ({
  element,
  context,
  scale,
  zoom,
  scrollX,
  scrollY,
  theme,
  opacity,
}: {
  element: ExcalidrawFreeDrawElement;
  context: CanvasRenderingContext2D;
  scale: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
  theme: AppState["theme"];
  opacity: number;
}) => {
  if (!stroke || stroke.element !== element) {
    stroke = {
      element,
      ink: new FreedrawLiveInk(),
      paths: [],
      box: [Infinity, Infinity, -Infinity, -Infinity],
      rough: null,
    };
  }
  const live = stroke;
  const frame = live.ink.update(element);
  if (frame.restarted) {
    live.paths = [];
    live.box = [Infinity, Infinity, -Infinity, -Infinity];
  }
  const offsetX = element.x + scrollX;
  const offsetY = element.y + scrollY;
  const deviceScale = scale * zoom;
  for (let i = live.paths.length; i < frame.chunks.length; i++) {
    const path = new Path2D();
    writeFreedrawOutlinePath(path, frame.chunks[i]);
    live.paths.push(path);
  }

  const color = applyDarkModeFilter(element.strokeColor, theme === THEME.DARK);
  const target = context.canvas;

  context.save();
  context.globalAlpha = 1;

  // a closed stroke with a fill: the rough fill under the ink (rare; it is
  // rebuilt on every frame, as before). On this canvas: App's rough canvas
  // draws on the static scene
  if (!isTransparent(element.backgroundColor)) {
    const background = getFreedrawBackgroundShape(element, theme);
    if (background) {
      if (live.rough?.target !== target) {
        live.rough = { target, canvas: rough.canvas(target) };
      }
      context.save();
      context.translate(offsetX, offsetY);
      live.rough.canvas.draw(background);
      context.restore();
    }
  }

  // the finished pieces: into the layer once, then the layer onto the canvas
  const pieces = getLayer();
  if (pieces && live.paths.length) {
    const key = `${target.width}x${target.height}|${deviceScale}|${offsetX}|${offsetY}|${color}`;
    if (
      pieces.owner !== live ||
      pieces.key !== key ||
      frame.restarted ||
      pieces.drawn > live.paths.length
    ) {
      pieces.canvas.width = target.width;
      pieces.canvas.height = target.height;
      pieces.owner = live;
      pieces.key = key;
      pieces.drawn = 0;
      live.box = [Infinity, Infinity, -Infinity, -Infinity];
    }
    if (pieces.drawn < live.paths.length) {
      const layerContext = pieces.context;
      layerContext.setTransform(
        deviceScale,
        0,
        0,
        deviceScale,
        offsetX * deviceScale,
        offsetY * deviceScale,
      );
      layerContext.fillStyle = color;
      for (let i = pieces.drawn; i < live.paths.length; i++) {
        layerContext.fill(live.paths[i]);
        extendBox(live.box, frame.chunks[i], deviceScale, offsetX, offsetY);
      }
      pieces.drawn = live.paths.length;
    }
    const x1 = Math.max(0, Math.floor(live.box[0]) - 2);
    const y1 = Math.max(0, Math.floor(live.box[1]) - 2);
    const x2 = Math.min(target.width, Math.ceil(live.box[2]) + 2);
    const y2 = Math.min(target.height, Math.ceil(live.box[3]) + 2);
    if (x2 > x1 && y2 > y1) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(
        pieces.canvas,
        x1,
        y1,
        x2 - x1,
        y2 - y1,
        x1,
        y1,
        x2 - x1,
        y2 - y1,
      );
      context.restore();
    }
  }

  // the rest of the stroke, rebuilt on every frame
  const tail = new Path2D();
  writeFreedrawOutlinePath(tail, frame.tail);
  context.translate(offsetX, offsetY);
  context.fillStyle = color;
  context.fill(tail);
  context.restore();

  if (opacity < 1) {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "destination-in";
    context.globalAlpha = 1;
    context.fillStyle = `rgba(0, 0, 0, ${opacity})`;
    context.fillRect(0, 0, target.width, target.height);
    context.restore();
  }
};
