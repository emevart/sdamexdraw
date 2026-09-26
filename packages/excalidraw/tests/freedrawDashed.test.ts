import {
  getFreeDrawCenterlineSvgPath,
  getFreedrawDashArray,
  getFreedrawDashWidth,
  getFreedrawStrokeRadius,
  hasSloppiness,
  hasStrokeStyle,
  isDashedFreedraw,
} from "@excalidraw/element";

import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawFreeDrawElement,
  NonDeleted,
  StrokeStyle,
} from "@excalidraw/element/types";

import { exportToSvg } from "../scene/export";

import { API } from "./helpers/api";

const stroke = (
  strokeStyle: StrokeStyle,
  points: LocalPoint[] = [
    pointFrom(0, 0),
    pointFrom(40, 10),
    pointFrom(80, 0),
    pointFrom(120, 20),
  ],
) =>
  API.createElement({
    type: "freedraw",
    x: 10,
    y: 10,
    strokeWidth: 2,
    strokeStyle,
    points,
  }) as NonDeleted<ExcalidrawFreeDrawElement>;

const exportedInk = async (element: NonDeleted<ExcalidrawFreeDrawElement>) => {
  const svg = await exportToSvg(
    [element],
    { exportBackground: false, viewBackgroundColor: "#ffffff" },
    null,
    { skipInliningFonts: true },
  );
  const paths = svg.querySelectorAll("path");
  return paths[paths.length - 1];
};

// sdamex (founder 26.09): dashed and dotted pen. The solid ink is a filled
// outline that follows the pressure; a dash pattern cannot follow it, so a
// dashed stroke is its centerline stroked with an even width.
describe("dashed pen (sdamex)", () => {
  it("only a dashed or dotted pen stroke takes the centerline path", () => {
    expect(isDashedFreedraw(stroke("solid"))).toBe(false);
    expect(isDashedFreedraw(stroke("dashed"))).toBe(true);
    expect(isDashedFreedraw(stroke("dotted"))).toBe(true);
    expect(
      isDashedFreedraw(
        API.createElement({ type: "line", strokeStyle: "dashed" }),
      ),
    ).toBe(false);
  });

  it("the pen offers a stroke style but no sloppiness", () => {
    expect(hasStrokeStyle("freedraw")).toBe(true);
    expect(hasSloppiness("freedraw")).toBe(false);
    expect(hasSloppiness("rectangle")).toBe(true);
    expect(hasSloppiness("image")).toBe(false);
  });

  it("keeps the weight of the solid ink at medium pressure", () => {
    const element = stroke("dashed");
    const width = getFreedrawDashWidth(element);
    const inkWidth = getFreedrawStrokeRadius(element) * 2;

    expect(width).toBeGreaterThan(inkWidth * 0.5);
    expect(width).toBeLessThan(inkWidth);
  });

  it("scales the dash pattern by the width, dots are near-zero dashes", () => {
    const dashed = stroke("dashed");
    const dotted = stroke("dotted");
    const width = getFreedrawDashWidth(dashed);

    expect(getFreedrawDashArray(dashed)).toEqual([width * 3, width * 3]);
    const [dot, gap] = getFreedrawDashArray(dotted);
    expect(dot).toBeLessThan(width * 0.1);
    expect(gap).toBeGreaterThan(width);
  });

  it("the centerline starts and ends at the stroke ends", () => {
    const d = getFreeDrawCenterlineSvgPath(stroke("dashed"));

    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("L 120 20")).toBe(true);
  });

  it("a tap still draws a dot", () => {
    const d = getFreeDrawCenterlineSvgPath(
      stroke("dotted", [pointFrom(5, 5), pointFrom(5, 5)]),
    );

    expect(d).toMatch(/^M 5 5 L 5\.01 5$/);
  });

  it("a click (pointerup moved by 0.0001) is a dot, not a zero-length path", () => {
    const d = getFreeDrawCenterlineSvgPath(
      stroke("dotted", [pointFrom(0, 0), pointFrom(0.0001, 0.0001)]),
    );

    expect(d).toBe("M 0 0 L 0.01 0");
  });

  it("a closed loop is not a tap", () => {
    const loop = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
      pointFrom<LocalPoint>(
        50 - 50 * Math.cos((i * Math.PI) / 4),
        50 * Math.sin((i * Math.PI) / 4),
      ),
    );
    loop[loop.length - 1] = loop[0];
    const d = getFreeDrawCenterlineSvgPath(stroke("dashed", loop));

    expect(d.startsWith("M 0 0 Q")).toBe(true);
    expect(d.endsWith("L 0 0")).toBe(true);
  });

  it("writes plain decimals: no exponent notation", () => {
    const d = getFreeDrawCenterlineSvgPath(
      stroke("dashed", [
        pointFrom(0, 0),
        pointFrom(1e-7, 20),
        pointFrom(-1e-7, 40),
        pointFrom(0, 60),
      ]),
    );

    expect(d).not.toMatch(/e/);
  });

  it("svg export strokes the centerline with the dash pattern", async () => {
    const element = stroke("dashed");
    const ink = await exportedInk(element);

    expect(ink.getAttribute("fill")).toBe("none");
    expect(ink.getAttribute("stroke")).toBe(element.strokeColor);
    expect(ink.getAttribute("stroke-dasharray")).toBe(
      getFreedrawDashArray(element).join(" "),
    );
    expect(ink.getAttribute("d")).toBe(getFreeDrawCenterlineSvgPath(element));
  });

  it("svg export of a solid pen stroke stays a filled outline", async () => {
    const element = stroke("solid");
    const ink = await exportedInk(element);

    expect(ink.getAttribute("fill")).toBe(element.strokeColor);
    expect(ink.getAttribute("stroke-dasharray")).toBeNull();
  });
});
