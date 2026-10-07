import { throttleRAF } from "@excalidraw/common";

import {
  getContainingFrame,
  getFreedrawPenInk,
  getRenderOpacity,
  getTargetFrame,
  isDashedFreedraw,
  isInvisiblySmallElement,
  renderElement,
  renderFreedrawLiveInk,
  shouldApplyFrameClip,
} from "@excalidraw/element";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";

import { frameClip } from "./staticScene";

import type { NewElementSceneRenderConfig } from "../scene/types";

const _renderNewElementScene = ({
  canvas,
  rc,
  newElement,
  elementsMap,
  allElementsMap,
  scale,
  appState,
  renderConfig,
}: NewElementSceneRenderConfig) => {
  if (canvas) {
    const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
      canvas,
      scale,
    );

    const context = bootstrapCanvas({
      canvas,
      scale,
      normalizedWidth,
      normalizedHeight,
    });

    context.save();

    // Apply zoom
    context.scale(appState.zoom.value, appState.zoom.value);

    if (newElement && newElement.type !== "selection") {
      // e.g. when creating arrows and we're still below the arrow drag distance
      // threshold
      // (for now we skip render only with elements while we're creating to be
      // safe)
      if (isInvisiblySmallElement(newElement)) {
        return;
      }

      const frameId = newElement.frameId || appState.frameToHighlight?.id;

      if (
        frameId &&
        appState.frameRendering.enabled &&
        appState.frameRendering.clip
      ) {
        const frame = getTargetFrame(newElement, elementsMap, appState);

        if (
          frame &&
          shouldApplyFrameClip(newElement, frame, appState, elementsMap)
        ) {
          frameClip(frame, context, renderConfig, appState);
        }
      }

      if (
        newElement.type === "freedraw" &&
        getFreedrawPenInk() === "v2" &&
        !isDashedFreedraw(newElement)
      ) {
        // sdamex #5706: pen ink v2 draws the finished part of a stroke once
        // and rebuilds only its end on each frame
        renderFreedrawLiveInk({
          element: newElement,
          context,
          rc,
          scale,
          zoom: appState.zoom.value,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          theme: appState.theme,
          opacity: getRenderOpacity(
            newElement,
            getContainingFrame(newElement, elementsMap),
            renderConfig.elementsPendingErasure,
            renderConfig.pendingFlowchartNodes,
          ),
        });
      } else {
        renderElement(
          newElement,
          elementsMap,
          allElementsMap,
          rc,
          context,
          renderConfig,
          appState,
        );
      }
    } else {
      context.clearRect(0, 0, normalizedWidth, normalizedHeight);
    }

    context.restore();
  }
};

export const renderNewElementSceneThrottled = throttleRAF(
  (config: NewElementSceneRenderConfig) => {
    _renderNewElementScene(config);
  },
);

export const renderNewElementScene = (
  renderConfig: NewElementSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderNewElementSceneThrottled(renderConfig);
    return;
  }

  _renderNewElementScene(renderConfig);
};
