import { createHash } from "node:crypto";

import type { LocalPoint, Radians } from "@excalidraw/math";

import {
  ShapeCache,
  getFreedrawOutlinePoints,
  getFreedrawPenInk,
} from "../src/shape";

import fixture from "./fixtures/freedrawInk-0.30.9.json";

import type { ExcalidrawFreeDrawElement } from "../src/types";

// sdamex #5706: the default pen ink ("legacy") must stay the ink of 0.30.9
// byte for byte, on strokes of every kind. The fixture holds the inputs and
// sha256 of the SVG path and the outline 0.30.9 produced for them.

const freedraw = (
  stroke: typeof fixture.strokes[number],
): ExcalidrawFreeDrawElement =>
  ({
    id: `fd-legacy-${stroke.name}`,
    type: "freedraw",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    angle: 0 as Radians,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: stroke.strokeWidth,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    points: stroke.points as LocalPoint[],
    pressures: stroke.pressures,
    simulatePressure: stroke.simulatePressure,
    lastCommittedPoint: null,
  } as unknown as ExcalidrawFreeDrawElement);

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

describe("legacy pen ink is the ink of 0.30.9 (sdamex #5706)", () => {
  it("is the default", () => {
    expect(getFreedrawPenInk()).toBe("legacy");
  });

  it.each(fixture.strokes.map((stroke) => [stroke.name, stroke] as const))(
    "%s",
    (_, stroke) => {
      const element = freedraw(stroke);
      const shapes = ShapeCache.generateElementShape(element, null);
      const svg = shapes[shapes.length - 1];
      expect(typeof svg).toBe("string");
      expect((svg as string).length).toBe(stroke.svgLength);
      expect(sha256(svg as string)).toBe(stroke.svgSha256);

      const outline = getFreedrawOutlinePoints(element);
      expect(outline.length).toBe(stroke.outlineLength);
      expect(sha256(JSON.stringify(outline))).toBe(stroke.outlineSha256);
    },
  );
});
