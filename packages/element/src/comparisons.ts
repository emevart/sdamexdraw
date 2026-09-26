import type { ElementOrToolType } from "@excalidraw/excalidraw/types";

export const hasBackground = (type: ElementOrToolType) =>
  type === "rectangle" ||
  type === "iframe" ||
  type === "embeddable" ||
  type === "ellipse" ||
  type === "diamond" ||
  type === "triangle" ||
  type === "line" ||
  type === "freedraw";

export const hasStrokeColor = (type: ElementOrToolType) =>
  type === "rectangle" ||
  type === "ellipse" ||
  type === "diamond" ||
  type === "triangle" ||
  type === "prism" ||
  type === "pyramid" ||
  type === "tetrahedron" ||
  type === "cylinder" ||
  type === "sphere" ||
  type === "freedraw" ||
  type === "arrow" ||
  type === "line" ||
  type === "text" ||
  type === "embeddable";

export const hasStrokeWidth = (type: ElementOrToolType) =>
  type === "rectangle" ||
  type === "iframe" ||
  type === "embeddable" ||
  type === "ellipse" ||
  type === "diamond" ||
  type === "triangle" ||
  type === "prism" ||
  type === "pyramid" ||
  type === "tetrahedron" ||
  type === "cylinder" ||
  type === "sphere" ||
  type === "freedraw" ||
  type === "arrow" ||
  type === "line";

export const hasStrokeStyle = (type: ElementOrToolType) =>
  // sdamex: the pen draws dashed and dotted strokes too
  type === "freedraw" ||
  type === "rectangle" ||
  type === "iframe" ||
  type === "embeddable" ||
  type === "ellipse" ||
  type === "diamond" ||
  type === "triangle" ||
  type === "arrow" ||
  type === "line";

// sdamex: the pen has a stroke style but no sloppiness (the ink ignores it,
// and the shared value would only make the next shapes sloppy)
export const hasSloppiness = (type: ElementOrToolType) =>
  type !== "freedraw" && hasStrokeStyle(type);

export const canChangeRoundness = (type: ElementOrToolType) =>
  type === "rectangle" ||
  type === "iframe" ||
  type === "embeddable" ||
  type === "line" ||
  type === "diamond" ||
  type === "image";

export const toolIsArrow = (type: ElementOrToolType) => type === "arrow";

export const canHaveArrowheads = (type: ElementOrToolType) => type === "arrow";
