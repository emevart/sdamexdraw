import React, { useMemo } from "react";

import {
  doBoundsIntersect,
  getElementAbsoluteCoords,
  getElementBounds,
  isFreeDrawElement,
  isIframeLikeElement,
  isLineElement,
  isLinearElement,
  isPathALoop,
} from "@excalidraw/element";

import type {
  ElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { getAboveEmbeddablesBands } from "../renderer/staticScene";

import type { AppState } from "../types";

export interface AboveEmbeddablesHitTarget {
  element: NonDeletedExcalidrawElement;
  occludedBy: readonly NonDeletedExcalidrawElement[];
}

/**
 * Computes selectable, non-deleted, non-locked elements stacked above any
 * visible embeddable whose bounding box intersects at least one earlier
 * embeddable (#6126). Preserves z-order occlusion by recording later
 * embeddables stacked over each hit target.
 */
export const getSelectableElementsOverEmbeddables = ({
  visibleElements,
  allElementsMap,
}: {
  visibleElements: readonly NonDeletedExcalidrawElement[];
  allElementsMap: ElementsMap;
}): AboveEmbeddablesHitTarget[] => {
  const bands = getAboveEmbeddablesBands(visibleElements);
  if (bands.length === 0) {
    return [];
  }

  const embeddables = visibleElements.filter((el) => isIframeLikeElement(el));
  const embedBounds = embeddables.map((el) =>
    getElementBounds(el, allElementsMap),
  );

  const targets: AboveEmbeddablesHitTarget[] = [];

  for (const band of bands) {
    const belowCount = embeddables.length - band.above.length;
    for (const element of band.elements) {
      if (element.isDeleted || element.locked || isIframeLikeElement(element)) {
        continue;
      }
      const elBounds = getElementBounds(element, allElementsMap);
      let overlapsBelow = false;
      for (let i = 0; i < belowCount; i++) {
        if (doBoundsIntersect(elBounds, embedBounds[i])) {
          overlapsBelow = true;
          break;
        }
      }
      if (!overlapsBelow) {
        continue;
      }
      const occludedBy: NonDeletedExcalidrawElement[] = [];
      for (let i = belowCount; i < embeddables.length; i++) {
        if (doBoundsIntersect(elBounds, embedBounds[i])) {
          occludedBy.push(embeddables[i]);
        }
      }
      targets.push({ element, occludedBy });
    }
  }

  return targets;
};

const getRotationTransform = (
  element: NonDeletedExcalidrawElement,
  allElementsMap: ElementsMap,
): string | undefined => {
  if (!element.angle) {
    return undefined;
  }
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, allElementsMap);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const deg = (element.angle * 180) / Math.PI;
  return `rotate(${deg} ${cx} ${cy})`;
};

const rotatedRectSubpath = (
  element: NonDeletedExcalidrawElement,
  allElementsMap: ElementsMap,
): string => {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const hw = element.width / 2;
  const hh = element.height / 2;
  const cos = Math.cos(element.angle);
  const sin = Math.sin(element.angle);
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([dx, dy]) => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]);
  void allElementsMap;
  return `M ${corners[0][0]} ${corners[0][1]} L ${corners[1][0]} ${corners[1][1]} L ${corners[2][0]} ${corners[2][1]} L ${corners[3][0]} ${corners[3][1]} Z`;
};

const renderHitShape = (
  element: NonDeletedExcalidrawElement,
  allElementsMap: ElementsMap,
  zoom: number,
  clipPathId?: string,
) => {
  const hitStrokeWidth = Math.max(element.strokeWidth || 1, 12 / zoom);
  const hasFill = Boolean(
    element.backgroundColor && element.backgroundColor !== "transparent",
  );
  const transform = getRotationTransform(element, allElementsMap);
  const commonProps = {
    "data-hit-element-id": element.id,
    clipPath: clipPathId ? `url(#${clipPathId})` : undefined,
    transform,
  };

  if (isFreeDrawElement(element) || isLinearElement(element)) {
    const points = element.points;
    if (points.length === 0) {
      return null;
    }
    const d =
      points.length === 1
        ? `M ${element.x + points[0][0]} ${element.y + points[0][1]} L ${
            element.x + points[0][0] + 0.01
          } ${element.y + points[0][1] + 0.01}`
        : points
            .map(
              (pt, idx) =>
                `${idx === 0 ? "M" : "L"} ${element.x + pt[0]} ${
                  element.y + pt[1]
                }`,
            )
            .join(" ");
    const pointerEvents =
      isLineElement(element) && isPathALoop(element.points) && hasFill
        ? "all"
        : "stroke";
    return (
      <path
        key={element.id}
        {...commonProps}
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents, cursor: "move" }}
      />
    );
  }

  if (element.type === "ellipse") {
    return (
      <ellipse
        key={element.id}
        {...commonProps}
        cx={element.x + element.width / 2}
        cy={element.y + element.height / 2}
        rx={Math.max(Math.abs(element.width) / 2, 1)}
        ry={Math.max(Math.abs(element.height) / 2, 1)}
        fill="transparent"
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        style={{ pointerEvents: hasFill ? "all" : "stroke", cursor: "move" }}
      />
    );
  }

  if (element.type === "diamond") {
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    const d = `M ${cx} ${element.y} L ${
      element.x + element.width
    } ${cy} L ${cx} ${element.y + element.height} L ${element.x} ${cy} Z`;
    return (
      <path
        key={element.id}
        {...commonProps}
        d={d}
        fill="transparent"
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        style={{ pointerEvents: hasFill ? "all" : "stroke", cursor: "move" }}
      />
    );
  }

  const filledAll =
    element.type === "text" ||
    element.type === "image" ||
    element.type === "frame" ||
    element.type === "magicframe" ||
    hasFill;

  return (
    <rect
      key={element.id}
      {...commonProps}
      x={element.x}
      y={element.y}
      width={Math.max(Math.abs(element.width), 1)}
      height={Math.max(Math.abs(element.height), 1)}
      fill="transparent"
      stroke="transparent"
      strokeWidth={hitStrokeWidth}
      style={{ pointerEvents: filledAll ? "all" : "stroke", cursor: "move" }}
    />
  );
};

export const AboveEmbeddablesHitLayer = ({
  visibleElements,
  allElementsMap,
  appState,
  onPointerDown,
  onPointerUp,
}: {
  visibleElements: readonly NonDeletedExcalidrawElement[];
  allElementsMap: ElementsMap;
  appState: Pick<AppState, "scrollX" | "scrollY" | "zoom" | "width" | "height">;
  onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
}) => {
  const targets = useMemo(
    () =>
      getSelectableElementsOverEmbeddables({
        visibleElements,
        allElementsMap,
      }),
    [visibleElements, allElementsMap],
  );

  if (targets.length === 0) {
    return null;
  }

  const zoom = appState.zoom.value || 1;
  const vpX = -appState.scrollX - 1;
  const vpY = -appState.scrollY - 1;
  const vpW = appState.width / zoom + 2;
  const vpH = appState.height / zoom + 2;
  const outerRect = `M ${vpX} ${vpY} H ${vpX + vpW} V ${vpY + vpH} H ${vpX} Z`;

  return (
    <svg
      className="excalidraw__above-embeddables-hit"
      width={appState.width}
      height={appState.height}
      style={{ pointerEvents: "none" }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <g
        transform={`scale(${zoom}) translate(${appState.scrollX}, ${appState.scrollY})`}
      >
        <defs>
          {targets.map(({ element, occludedBy }) =>
            occludedBy.length > 0 ? (
              <clipPath
                key={`clip-${element.id}`}
                id={`above-emb-clip-${element.id}`}
                clipPathUnits="userSpaceOnUse"
              >
                <path
                  clipRule="evenodd"
                  d={`${outerRect} ${occludedBy
                    .map((emb) => rotatedRectSubpath(emb, allElementsMap))
                    .join(" ")}`}
                />
              </clipPath>
            ) : null,
          )}
        </defs>
        {targets.map(({ element, occludedBy }) =>
          renderHitShape(
            element,
            allElementsMap,
            zoom,
            occludedBy.length > 0 ? `above-emb-clip-${element.id}` : undefined,
          ),
        )}
      </g>
    </svg>
  );
};
