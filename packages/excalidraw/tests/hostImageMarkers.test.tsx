import React from "react";
import rough from "roughjs/bin/rough";

import {
  arrayToMap,
  DARK_THEME_FILTER,
  reseed,
  THEME,
} from "@excalidraw/common";
import {
  drawImageInvertedPerPixel,
  IMAGE_PLACEHOLDER_LABEL_KEY,
  INVERT_IN_DARK_THEME_KEY,
  MAX_INVERT_CANVAS_PIXELS,
  renderElement,
} from "@excalidraw/element";

import type {
  ExcalidrawImageElement,
  FileId,
  NonDeleted,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { getDefaultAppState } from "../appState";
import { exportToSvg } from "../scene/export";

import { API } from "./helpers/api";
import { act, render, unmountComponent } from "./test-utils";

import type { BinaryFiles } from "../types";
import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../scene/types";

// sdamex emevart/billion-dollars#5713: host markers on image elements
// (customData) and the host insert control in place of the image tool.

const FILE_ID = "pdf-page-1" as FileId;
const DATA_URL =
  "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

type CanvasEvent = { type: string; props: Record<string, unknown> };

const imageElement = (customData?: Record<string, unknown>) =>
  ({
    ...API.createElement({
      type: "image",
      x: 0,
      y: 0,
      width: 400,
      height: 566,
      fileId: FILE_ID,
    }),
    customData,
  } as NonDeleted<ExcalidrawImageElement>);

const files: BinaryFiles = {
  [FILE_ID]: {
    id: FILE_ID,
    dataURL: DATA_URL as BinaryFiles[string]["dataURL"],
    mimeType: "image/webp",
    created: 1,
  },
};

const exportSvgMarkup = async (
  element: NonDeleted<ExcalidrawImageElement>,
  exportWithDarkMode: boolean,
) => {
  const svg = await exportToSvg(
    [element],
    {
      exportBackground: false,
      viewBackgroundColor: "#ffffff",
      exportWithDarkMode,
    },
    files,
    { skipInliningFonts: true },
  );
  return svg.outerHTML;
};

/** Draws one element straight onto a fresh canvas (export path, no cache). */
const drawOnCanvas = (
  element: NonDeleted<ExcalidrawImageElement>,
  theme: StaticCanvasRenderConfig["theme"],
  withImage: boolean,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 1200;
  const context = canvas.getContext("2d")!;
  const image = document.createElement("img");
  Object.defineProperty(image, "naturalWidth", { value: 800 });
  Object.defineProperty(image, "naturalHeight", { value: 1132 });
  const imageCache: StaticCanvasRenderConfig["imageCache"] = new Map(
    withImage ? [[FILE_ID, { image, mimeType: "image/webp" }]] : [],
  );
  const renderConfig: StaticCanvasRenderConfig = {
    canvasBackgroundColor: "#ffffff",
    imageCache,
    renderGrid: false,
    isExporting: true,
    embedsValidationStatus: new Map(),
    elementsPendingErasure: new Set(),
    pendingFlowchartNodes: null,
    theme,
  };
  const elementsMap = arrayToMap([element]);
  renderElement(
    element,
    elementsMap as unknown as RenderableElementsMap,
    elementsMap as unknown as NonDeletedSceneElementsMap,
    rough.canvas(canvas),
    context,
    renderConfig,
    {
      ...getDefaultAppState(),
      width: 800,
      height: 1200,
      offsetLeft: 0,
      offsetTop: 0,
    } as any,
  );
  return (context as unknown as { __getEvents(): CanvasEvent[] }).__getEvents();
};

const filterValues = (events: CanvasEvent[]) =>
  events
    .filter((event) => event.type === "filter")
    .map((event) => event.props.value);

const filledTexts = (events: CanvasEvent[]) =>
  events
    .filter((event) => event.type === "fillText")
    .map((event) => event.props.text);

describe("image invert marker (sdamex)", () => {
  it("inverts a marked raster in the dark theme on canvas", () => {
    const events = drawOnCanvas(
      imageElement({ [INVERT_IN_DARK_THEME_KEY]: true }),
      THEME.DARK,
      true,
    );
    expect(filterValues(events)).toContain(DARK_THEME_FILTER);
  });

  it("leaves an unmarked raster and the light theme as they are", () => {
    expect(
      filterValues(drawOnCanvas(imageElement(), THEME.DARK, true)),
    ).not.toContain(DARK_THEME_FILTER);
    expect(
      filterValues(
        drawOnCanvas(
          imageElement({ [INVERT_IN_DARK_THEME_KEY]: true }),
          THEME.LIGHT,
          true,
        ),
      ),
    ).not.toContain(DARK_THEME_FILTER);
  });

  it("inverts a marked raster in a dark SVG export only", async () => {
    const marked = imageElement({ [INVERT_IN_DARK_THEME_KEY]: true });
    expect(await exportSvgMarkup(marked, true)).toContain(
      `filter="${DARK_THEME_FILTER}"`,
    );
    expect(await exportSvgMarkup(marked, false)).not.toContain(
      DARK_THEME_FILTER,
    );
    expect(await exportSvgMarkup(imageElement(), true)).not.toContain(
      DARK_THEME_FILTER,
    );
  });
});

describe("per-pixel invert, Safari path (sdamex)", () => {
  /** Runs the helper on a context with the given scale; returns the temp canvas. */
  const invertWithScale = (
    scale: number,
    source: { width: number; height: number },
    box: { width: number; height: number },
  ) => {
    const target = document.createElement("canvas");
    target.width = 4000;
    target.height = 4000;
    const context = target.getContext("2d")!;
    context.scale(scale, scale);
    const image = document.createElement("img");
    const created: HTMLCanvasElement[] = [];
    const createElement = document.createElement.bind(document);
    const spy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const element = createElement(tag, options);
        if (tag === "canvas") {
          created.push(element as HTMLCanvasElement);
        }
        return element;
      });
    const drawImage = vi.spyOn(context, "drawImage");
    try {
      drawImageInvertedPerPixel(context, image, { x: 0, y: 0, ...source }, box);
    } finally {
      spy.mockRestore();
    }
    // Last draw on the target: (temp, 0, 0, tempW, tempH, 0, 0, boxW, boxH).
    const last = drawImage.mock.calls.at(-1)!;
    return {
      temp: created[0],
      drawnFrom: [last[3], last[4]] as number[],
      drawnTo: [last[7], last[8]] as number[],
    };
  };

  it("sizes the temp canvas by the context scale, capped by the source", () => {
    // Page 400 px wide on screen at 2x: 800 device px, source has 1600.
    expect(
      invertWithScale(
        2,
        { width: 1600, height: 2264 },
        {
          width: 400,
          height: 566,
        },
      ).drawnFrom,
    ).toEqual([800, 1132]);
    // Zoomed in to 3x on a 3x phone: never above the source pixels.
    const zoomed = invertWithScale(
      9,
      { width: 1600, height: 2264 },
      { width: 400, height: 566 },
    );
    expect(zoomed.drawnFrom).toEqual([1600, 2264]);
    expect(zoomed.drawnTo).toEqual([400, 566]);
  });

  it("caps the temp canvas pixels", () => {
    const { drawnFrom } = invertWithScale(
      1,
      { width: 4000, height: 4000 },
      { width: 4000, height: 4000 },
    );
    expect(drawnFrom[0] * drawnFrom[1]).toBeLessThanOrEqual(
      MAX_INVERT_CANVAS_PIXELS + 2 * drawnFrom[0],
    );
    expect(drawnFrom[0]).toBe(2048);
  });

  it("releases the temp canvas right after the draw", () => {
    const { temp } = invertWithScale(
      2,
      { width: 1600, height: 2264 },
      { width: 400, height: 566 },
    );
    expect(temp.width).toBe(0);
    expect(temp.height).toBe(0);
  });
});

describe("image placeholder label (sdamex)", () => {
  it("draws the label instead of the icon while the file is missing", () => {
    const events = drawOnCanvas(
      imageElement({
        [IMAGE_PLACEHOLDER_LABEL_KEY]: "2\nСтраница загружается",
      }),
      THEME.LIGHT,
      false,
    );
    expect(filledTexts(events)).toEqual(["2", "Страница загружается"]);
    expect(events.some((event) => event.type === "drawImage")).toBe(false);
  });

  it("keeps the icon without a label and draws the image once loaded", () => {
    const unlabelled = drawOnCanvas(imageElement(), THEME.LIGHT, false);
    expect(filledTexts(unlabelled)).toEqual([]);
    expect(unlabelled.some((event) => event.type === "drawImage")).toBe(true);

    const loaded = drawOnCanvas(
      imageElement({ [IMAGE_PLACEHOLDER_LABEL_KEY]: "2" }),
      THEME.LIGHT,
      true,
    );
    expect(filledTexts(loaded)).toEqual([]);
  });
});

describe("renderToolbarInsert (sdamex)", () => {
  const renderInsert = (isMobile: boolean) => (
    <button type="button" data-testid="host-insert">
      {isMobile ? "mobile" : "desktop"}
    </button>
  );

  beforeEach(() => {
    unmountComponent();
    reseed(7);
  });

  it("replaces the image tool on the desktop toolbar", async () => {
    await render(<Excalidraw renderToolbarInsert={renderInsert} />);
    const insert = document.querySelector('[data-testid="host-insert"]')!;
    expect(insert.textContent).toBe("desktop");
    expect(document.querySelector('[data-testid="toolbar-image"]')).toBeNull();
    // in the image tool's place: after text, before the eraser
    const text = document.querySelector('[data-testid="toolbar-text"]')!;
    const eraser = document.querySelector('[data-testid="toolbar-eraser"]')!;
    expect(
      text.compareDocumentPosition(insert) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      insert.compareDocumentPosition(eraser) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("replaces the image tool on the phone toolbar", async () => {
    await render(
      <Excalidraw
        renderToolbarInsert={renderInsert}
        UIOptions={{ getFormFactor: () => "phone" }}
      />,
    );
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    const insert = document.querySelector('[data-testid="host-insert"]')!;
    expect(insert.textContent).toBe("mobile");
    expect(document.querySelector('[data-testid="toolbar-image"]')).toBeNull();
  });

  it("keeps the image tool without the prop", async () => {
    await render(<Excalidraw />);
    expect(
      document.querySelector('[data-testid="toolbar-image"]'),
    ).not.toBeNull();
  });
});
