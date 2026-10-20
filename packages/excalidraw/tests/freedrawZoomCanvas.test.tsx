import rough from "roughjs/bin/rough";
import { vi } from "vitest";

import { arrayToMap } from "@excalidraw/common";
import {
  ShapeCache,
  appendFreedrawPoints,
  elementWithCanvasCache,
  getFreedrawInkPath2D,
  newElementWith,
  setFreedrawPenInk,
} from "@excalidraw/element";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawFreeDrawElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import { renderStaticScene } from "../renderer/staticScene";
import { exportToCanvas, exportToSvg } from "../scene/export";

import { API } from "./helpers/api";

import type { StaticCanvasRenderConfig } from "../scene/types";
import type { AppState, StaticCanvasAppState } from "../types";

type Stroke = NonDeleted<ExcalidrawFreeDrawElement>;

// sdamex emevart/billion-dollars#6066 (F1): a pen stroke used to be drawn
// through its own element canvas sized bbox × dpr × zoom (+ padding), so at
// zoom 3–5 a board of 2000 strokes held gigabytes of canvases. Above zoom 1 the
// stroke is filled from its cached path in scene coordinates instead.

const STROKES = 2000;
const DPR = 2;

/** Pseudo-random, but the same on every run. */
const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const wave = (width: number, height: number, n = 24): LocalPoint[] =>
  Array.from(
    { length: n },
    (_, i) =>
      [
        (width * i) / (n - 1),
        height * (0.5 + 0.5 * Math.sin(i * 0.7)),
      ] as LocalPoint,
  );

const stroke = (
  props: Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
    strokeWidth: number;
    angle: number;
    strokeStyle: "solid" | "dashed" | "dotted";
    opacity: number;
  }> = {},
) => {
  const { width = 60, height = 30, ...rest } = props;
  return API.createElement({
    type: "freedraw",
    x: 100,
    y: 100,
    points: wave(width, height),
    strokeWidth: 2,
    ...rest,
  } as any) as unknown as Stroke;
};

/** Strokes with bbox 20–80 × 15–60, as in the estimate of the issue. */
const board = () => {
  const random = lcg(6066);
  return Array.from({ length: STROKES }, (_, i) =>
    stroke({
      x: (i % 50) * 90,
      y: Math.floor(i / 50) * 70,
      width: 20 + random() * 60,
      height: 15 + random() * 45,
      strokeWidth: [1, 2, 4][i % 3],
    }),
  );
};

const paint = (
  elements: NonDeletedExcalidrawElement[],
  zoom: number,
  canvas = document.createElement("canvas"),
) => {
  const elementsMap = arrayToMap(elements) as any;
  const renderConfig: StaticCanvasRenderConfig = {
    canvasBackgroundColor: "#ffffff",
    imageCache: new Map(),
    renderGrid: false,
    isExporting: false,
    embedsValidationStatus: new Map(),
    elementsPendingErasure: new Set(),
    pendingFlowchartNodes: null,
    theme: "light",
  };
  renderStaticScene(
    {
      canvas,
      rc: rough.canvas(canvas),
      elementsMap,
      allElementsMap: elementsMap,
      visibleElements: elements,
      scale: DPR,
      appState: {
        ...getDefaultAppState(),
        width: 1000,
        height: 1000,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX: 0,
        scrollY: 0,
        theme: "light",
        zoom: { value: zoom },
      } as unknown as StaticCanvasAppState,
      renderConfig,
    },
    false,
  );
  return canvas;
};

/** Total pixel area of the element canvases of the given elements. */
const elementCanvasArea = (
  elements: readonly NonDeletedExcalidrawElement[],
) => {
  let count = 0;
  let area = 0;
  for (const element of elements) {
    const entry = elementWithCanvasCache.get(element);
    if (entry?.canvas) {
      count++;
      area += entry.canvas.width * entry.canvas.height;
    }
  }
  return { count, megabytes: Math.round((area * 4) / 2 ** 20) };
};

type Fill = {
  context: CanvasRenderingContext2D;
  path: Path2D & { svg?: string };
  transform: DOMMatrix;
  fillStyle: string;
};
type Blit = {
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  args: number[];
  transform: DOMMatrix;
};

const OriginalPath2D = globalThis.Path2D;
let pathsBuilt = 0;
/** Path2D that remembers its SVG source (the mock ignores it). */
class RecordingPath2D extends OriginalPath2D {
  svg?: string;
  constructor(source?: string | Path2D) {
    super();
    pathsBuilt++;
    if (typeof source === "string") {
      this.svg = source;
    }
  }
}

const record = () => {
  const fills: Fill[] = [];
  const blits: Blit[] = [];
  const proto = CanvasRenderingContext2D.prototype;
  const fill = proto.fill;
  const drawImage = proto.drawImage;
  vi.spyOn(proto, "fill").mockImplementation(function (
    this: CanvasRenderingContext2D,
    ...args: any[]
  ) {
    if (args[0] instanceof OriginalPath2D) {
      fills.push({
        context: this,
        path: args[0],
        transform: this.getTransform(),
        fillStyle: String(this.fillStyle),
      });
    }
    return (fill as any).apply(this, args);
  });
  vi.spyOn(proto, "drawImage").mockImplementation(function (
    this: CanvasRenderingContext2D,
    ...args: any[]
  ) {
    blits.push({
      context: this,
      image: args[0],
      args: args.slice(1),
      transform: this.getTransform(),
    });
    return (drawImage as any).apply(this, args);
  });
  return { fills, blits };
};

const apply = (m: DOMMatrix, [x, y]: readonly [number, number]) =>
  [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] as const;

/**
 * Where a point of the stroke (element coordinates) lands on the scene canvas
 * when the stroke goes through its element canvas: the fill transform inside
 * the element canvas, then the blit of that canvas.
 */
const throughElementCanvas = (fill: Fill, blits: Blit[]) => {
  const blit = blits.find((b) => b.image === fill.context.canvas)!;
  expect(blit).toBeDefined();
  const [dx, dy, dw, dh] = blit.args;
  const { width, height } = fill.context.canvas;
  return (point: readonly [number, number]) => {
    const [px, py] = apply(fill.transform, point);
    return apply(blit.transform, [
      dx + (px * dw) / width,
      dy + (py * dh) / height,
    ]);
  };
};

const SAMPLES = [
  [0, 0],
  [12.5, 7],
  [-4, 31],
  [57, 3],
] as const;

let originalDpr: number;

beforeEach(() => {
  originalDpr = window.devicePixelRatio;
  Object.defineProperty(window, "devicePixelRatio", {
    value: DPR,
    configurable: true,
  });
  pathsBuilt = 0;
  vi.stubGlobal("Path2D", RecordingPath2D);
});

afterEach(() => {
  Object.defineProperty(window, "devicePixelRatio", {
    value: originalDpr,
    configurable: true,
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setFreedrawPenInk("legacy");
  ShapeCache.destroy();
});

describe.each(["legacy", "v2"] as const)(
  "pen strokes on a large zoom (%s ink, #6066 F1)",
  (ink) => {
    beforeEach(() => {
      setFreedrawPenInk(ink);
    });

    it.each([3, 5])(
      "draws 2000 strokes at zoom %s without element canvases",
      (zoom) => {
        const elements = board();
        paint(elements, zoom);
        expect(elementCanvasArea(elements)).toEqual({ count: 0, megabytes: 0 });
      },
      // 2000 strokes: before the fix the mock built every canvas, slow
      // under a loaded run
      30_000,
    );

    it("keeps element canvases at zoom 1 and below", () => {
      const elements = board().slice(0, 50);
      paint(elements, 1);
      expect(elementCanvasArea(elements).count).toBe(50);
    });

    it.each([
      ["straight", {}],
      ["rotated", { angle: 0.7 }],
      ["thick", { strokeWidth: 8, width: 140, height: 90 }],
      ["translucent", { opacity: 40 }],
    ])("lands a %s stroke where its element canvas put it", (_, props) => {
      const zoom = 3;
      const element = stroke({ x: 37, y: -12, ...props });
      // reference: the element canvas at zoom 1, scaled by the zoom
      const before = record();
      paint([element], 1);
      const viaCanvas = before.fills.at(-1)!;
      vi.restoreAllMocks();

      ShapeCache.destroy();
      const after = record();
      const scene = paint([element], zoom);
      const strokes = after.fills.filter((f) => f.context.canvas === scene);

      expect(strokes).toHaveLength(1);
      const direct = strokes[0];
      expect(after.blits.some((b) => b.context.canvas === scene)).toBe(false);
      expect(direct.fillStyle).toBe(viaCanvas.fillStyle);
      if (ink === "v2") {
        expect(direct.path).toBe(getFreedrawInkPath2D(element));
      } else {
        expect(direct.path.svg).toBeDefined();
        expect(direct.path.svg).toBe(viaCanvas.path.svg);
      }

      const reference = throughElementCanvas(viaCanvas, before.blits);
      for (const point of SAMPLES) {
        const [x, y] = apply(direct.transform, point);
        const [rx, ry] = reference(point);
        expect(x).toBeCloseTo(rx * zoom, 6);
        expect(y).toBeCloseTo(ry * zoom, 6);
      }
    });

    it("strokes a dashed pen without an element canvas", () => {
      const element = stroke({ strokeStyle: "dashed" });
      const { fills } = record();
      const strokeSpy = vi.spyOn(CanvasRenderingContext2D.prototype, "stroke");
      const scene = paint([element], 3);
      expect(elementWithCanvasCache.get(element)).toBeUndefined();
      expect(fills.filter((f) => f.context.canvas === scene)).toHaveLength(0);
      expect(
        strokeSpy.mock.contexts.filter((c) => (c as any).canvas === scene),
      ).toHaveLength(1);
    });

    it("keeps the element canvas for a translucent closed stroke with a fill", () => {
      // the fill and the ink are faded together only through the canvas
      const ring = (opacity: number) =>
        API.createElement({
          type: "freedraw",
          x: 0,
          y: 0,
          opacity,
          backgroundColor: "#ffc9c9",
          points: Array.from(
            { length: 25 },
            (_, i) =>
              [
                30 + 30 * Math.cos((i / 24) * 2 * Math.PI),
                30 + 30 * Math.sin((i / 24) * 2 * Math.PI),
              ] as LocalPoint,
          ),
        } as any) as unknown as Stroke;
      const translucent = ring(50);
      const opaque = ring(100);
      paint([translucent, opaque], 3);
      expect(elementWithCanvasCache.get(translucent)).toBeDefined();
      expect(elementWithCanvasCache.get(opaque)).toBeUndefined();
    });

    it("does not rebuild the stroke path on every frame", () => {
      const elements = board().slice(0, 100);
      paint(elements, 3);
      const built = pathsBuilt;
      paint(elements, 3);
      paint(elements, 4);
      expect(pathsBuilt).toBe(built);
    });

    describe("Path2D cache of the stroke", () => {
      let recorded: ReturnType<typeof record>;
      let strokeSpy: ReturnType<typeof vi.spyOn>;
      /** lineWidth at the moment of each stroke(): restore() resets it */
      let lineWidths: number[];
      beforeEach(() => {
        // spied once per test: spying again would call itself
        recorded = record();
        const stroke = CanvasRenderingContext2D.prototype.stroke;
        lineWidths = [];
        strokeSpy = vi
          .spyOn(CanvasRenderingContext2D.prototype, "stroke")
          .mockImplementation(function (
            this: CanvasRenderingContext2D,
            ...args: any[]
          ) {
            lineWidths.push(this.lineWidth);
            return (stroke as any).apply(this, args);
          });
      });

      /**
       * Paints the stroke at zoom 3 and returns what the scene canvas got for
       * it: the Path2D, and the style it was drawn with.
       */
      const drawnAt3 = (element: Stroke, dashed = false) => {
        recorded.fills.length = 0;
        strokeSpy.mockClear();
        lineWidths.length = 0;
        const scene = paint([element], 3);
        if (dashed) {
          const i = strokeSpy.mock.contexts.findIndex(
            (c) => (c as any).canvas === scene,
          );
          expect(i).toBeGreaterThanOrEqual(0);
          return {
            path: strokeSpy.mock.calls[i][0] as Path2D & { svg?: string },
            lineWidth: lineWidths[i],
          };
        }
        const drawn = recorded.fills.filter((f) => f.context.canvas === scene);
        expect(drawn).toHaveLength(1);
        return { path: drawn[0].path, fillStyle: drawn[0].fillStyle };
      };

      /** The SVG path ShapeCache holds for the stroke now. */
      const currentSvg = (element: Stroke) => {
        const shapes = ShapeCache.generateElementShape(element, {
          isExporting: false,
          canvasBackgroundColor: "#ffffff",
          embedsValidationStatus: new Map(),
          theme: "light",
        } as any);
        return shapes.find((shape) => typeof shape === "string");
      };

      const grow = (element: Stroke) => {
        const added = [
          [70, 12],
          [78, 20],
          [90, 8],
        ] as LocalPoint[];
        appendFreedrawPoints(element, added, [0.5, 0.5, 0.5]);
      };

      it("rebuilds the path when the stroke grows in place", () => {
        // the pen appends to the very same element object while drawing
        const element = stroke();
        const before = drawnAt3(element);
        expect(drawnAt3(element).path).toBe(before.path);

        grow(element);
        const after = drawnAt3(element);

        expect(after.path).not.toBe(before.path);
        if (ink === "v2") {
          expect(after.path).toBe(getFreedrawInkPath2D(element));
        } else {
          expect(after.path.svg).toBeDefined();
          expect(after.path.svg).not.toBe(before.path.svg);
          expect(after.path.svg).toBe(currentSvg(element));
        }
        // and then it is cached again
        expect(drawnAt3(element).path).toBe(after.path);
      });

      it("rebuilds the path of a dashed pen when the stroke grows in place", () => {
        // a dashed pen goes through the SVG path cache in both inks
        const element = stroke({ strokeStyle: "dashed" });
        const before = drawnAt3(element, true);
        expect(drawnAt3(element, true).path).toBe(before.path);

        grow(element);
        const after = drawnAt3(element, true);

        expect(after.path).not.toBe(before.path);
        expect(after.path.svg).toBeDefined();
        expect(after.path.svg).not.toBe(before.path.svg);
        expect(after.path.svg).toBe(currentSvg(element));
      });

      it.each([
        ["strokeWidth", { strokeWidth: 6 }],
        ["strokeColor", { strokeColor: "#e03131" }],
      ])("draws a copy with another %s with its own path", (_, props) => {
        const element = stroke();
        const before = drawnAt3(element);

        const copy = newElementWith(element, props) as Stroke;
        const after = drawnAt3(copy);

        expect(after.path).not.toBe(before.path);
        if (ink === "v2") {
          expect(after.path).toBe(getFreedrawInkPath2D(copy));
        } else {
          expect(after.path.svg).toBe(currentSvg(copy));
        }
        if ("strokeColor" in props) {
          expect(after.fillStyle).not.toBe(before.fillStyle);
        } else if (ink === "legacy") {
          // a wider stroke is a wider outline
          expect(after.path.svg).not.toBe(before.path.svg);
        }
        // the original keeps its own path
        expect(drawnAt3(element).path).toBe(before.path);
      });

      it("draws a dashed copy with another strokeWidth and color", () => {
        const element = stroke({ strokeStyle: "dashed" });
        const before = drawnAt3(element, true);

        const wider = newElementWith(element, { strokeWidth: 6 }) as Stroke;
        const afterWidth = drawnAt3(wider, true);
        expect(afterWidth.lineWidth).toBeGreaterThan(before.lineWidth!);
        expect(afterWidth.path.svg).toBe(currentSvg(wider));

        const red = newElementWith(element, {
          strokeColor: "#e03131",
        }) as Stroke;
        expect(drawnAt3(red, true).path.svg).toBe(currentSvg(red));
        expect(drawnAt3(element, true).path).toBe(before.path);
      });
    });

    it("leaves the PNG and SVG export unchanged", async () => {
      const elements = [
        stroke({ x: 0, y: 0 }),
        stroke({ x: 80, y: 40, angle: 0.4, strokeWidth: 4 }),
        stroke({ x: 10, y: 90, strokeStyle: "dashed" }),
      ];
      const appState = {
        ...getDefaultAppState(),
        zoom: { value: 3 },
        exportScale: 2,
      } as unknown as AppState;

      const canvas = await exportToCanvas(
        elements,
        appState,
        {},
        {
          exportBackground: false,
          viewBackgroundColor: "#ffffff",
        },
      );
      const calls = (canvas.getContext("2d") as any)
        .__getDrawCalls()
        .map((call: any) => ({
          type: call.type,
          transform: call.transform,
          path: call.props.path?.length,
        }));
      expect(calls).toMatchSnapshot("png");

      const svg = await exportToSvg(
        elements,
        { exportBackground: false, viewBackgroundColor: "#ffffff" },
        null,
        { skipInliningFonts: true },
      );
      const paths = Array.from(svg.querySelectorAll("path")).map((path) => ({
        d: path.getAttribute("d"),
        fill: path.getAttribute("fill"),
        stroke: path.getAttribute("stroke"),
        transform: path.parentElement?.getAttribute("transform"),
      }));
      expect(paths).toMatchSnapshot("svg");
    });
  },
);
