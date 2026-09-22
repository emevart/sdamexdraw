import {
  getBoundTextElement,
  getCommonFrameId,
  getFrameChildrenInsertionIndex,
  isArrowElement,
  isElementInViewport,
} from "@excalidraw/element";

import { arrayToMap, memoize, toBrandedType } from "@excalidraw/common";

import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  NonDeleted,
  NonDeletedElementsMap,
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import type { Scene } from "@excalidraw/element";

import { renderStaticSceneThrottled } from "../renderer/staticScene";

import type { RenderableElementsMap } from "./types";

import type { AppState } from "../types";

type GetRenderableElementsOpts = {
  zoom: AppState["zoom"];
  offsetLeft: AppState["offsetLeft"];
  offsetTop: AppState["offsetTop"];
  scrollX: AppState["scrollX"];
  scrollY: AppState["scrollY"];
  height: AppState["height"];
  width: AppState["width"];
  editingTextElement: AppState["editingTextElement"];
  newElement: AppState["newElement"];
  selectedElements: readonly NonDeletedExcalidrawElement[];
  selectedElementsAreBeingDragged: AppState["selectedElementsAreBeingDragged"];
  frameToHighlight: AppState["frameToHighlight"];
};

/**
 * sdamex: what the static canvas output depends on besides appState and
 * renderConfig, which StaticCanvas compares itself:
 * - the visible elements: ids, order, version, versionNonce;
 * - the frame that contains each of them (renderable map);
 * - the bound text drawn with each container (renderable map), even when the
 *   text itself is not in the visible list;
 * - the label of each visible arrow (full scene map): the arrow punches its
 *   label hole from `allElementsMap`, also while the label is being edited
 *   and therefore left out of the renderable map;
 * - forced `scene.triggerUpdate()` calls.
 */
export type StaticContentSnapshot = {
  forcedUpdateCount: number;
  ids: string[];
  versions: number[];
  versionNonces: number[];
  frameVersionNonces: (number | null)[];
  boundTextVersionNonces: (number | null)[];
  arrowLabelVersionNonces: (number | null)[];
};

/**
 * sdamex: module-level so that a static canvas nonce is never reissued, even
 * when App replaces the Renderer (componentWillUnmount) or `destroy()` resets
 * it while StaticCanvas keeps its last props (StrictMode remount).
 */
let staticCanvasNonceCounter = 0;

const getFrameVersionNonce = (
  element: NonDeletedExcalidrawElement,
  elementsMap: NonDeletedElementsMap,
) =>
  element.frameId
    ? elementsMap.get(element.frameId)?.versionNonce ?? null
    : null;

const getBoundTextVersionNonce = (
  element: NonDeletedExcalidrawElement,
  elementsMap: NonDeletedElementsMap,
) => getBoundTextElement(element, elementsMap)?.versionNonce ?? null;

const getArrowLabelVersionNonce = (
  element: NonDeletedExcalidrawElement,
  allElementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap,
) =>
  isArrowElement(element)
    ? getBoundTextElement(element, allElementsMap)?.versionNonce ?? null
    : null;

export const snapshotStaticContent = (
  visibleElements: readonly NonDeletedExcalidrawElement[],
  elementsMap: NonDeletedElementsMap,
  allElementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap,
  forcedUpdateCount: number,
): StaticContentSnapshot => ({
  forcedUpdateCount,
  ids: visibleElements.map((element) => element.id),
  versions: visibleElements.map((element) => element.version),
  versionNonces: visibleElements.map((element) => element.versionNonce),
  frameVersionNonces: visibleElements.map((element) =>
    getFrameVersionNonce(element, elementsMap),
  ),
  boundTextVersionNonces: visibleElements.map((element) =>
    getBoundTextVersionNonce(element, elementsMap),
  ),
  arrowLabelVersionNonces: visibleElements.map((element) =>
    getArrowLabelVersionNonce(element, allElementsMap),
  ),
});

export const isSameStaticContent = (
  snapshot: StaticContentSnapshot,
  visibleElements: readonly NonDeletedExcalidrawElement[],
  elementsMap: NonDeletedElementsMap,
  allElementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap,
  forcedUpdateCount: number,
): boolean => {
  if (
    snapshot.forcedUpdateCount !== forcedUpdateCount ||
    snapshot.ids.length !== visibleElements.length
  ) {
    return false;
  }
  for (let index = 0; index < visibleElements.length; index++) {
    const element = visibleElements[index];
    if (
      element.id !== snapshot.ids[index] ||
      element.version !== snapshot.versions[index] ||
      element.versionNonce !== snapshot.versionNonces[index] ||
      getFrameVersionNonce(element, elementsMap) !==
        snapshot.frameVersionNonces[index] ||
      getBoundTextVersionNonce(element, elementsMap) !==
        snapshot.boundTextVersionNonces[index] ||
      getArrowLabelVersionNonce(element, allElementsMap) !==
        snapshot.arrowLabelVersionNonces[index]
    ) {
      return false;
    }
  }
  return true;
};

export class Renderer {
  private scene: Scene;

  /** sdamex: see `getStaticCanvasNonce()` */
  private staticContent: {
    visibleElements: readonly NonDeletedExcalidrawElement[];
    sceneNonce: number | undefined;
    snapshot: StaticContentSnapshot;
    nonce: number;
  } | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private getVisibleCanvasElements({
    elementsMap,
    zoom,
    offsetLeft,
    offsetTop,
    scrollX,
    scrollY,
    height,
    width,
  }: {
    elementsMap: NonDeletedElementsMap;
    zoom: AppState["zoom"];
    offsetLeft: AppState["offsetLeft"];
    offsetTop: AppState["offsetTop"];
    scrollX: AppState["scrollX"];
    scrollY: AppState["scrollY"];
    height: AppState["height"];
    width: AppState["width"];
  }): readonly NonDeletedExcalidrawElement[] {
    const visibleElements: NonDeletedExcalidrawElement[] = [];
    for (const element of elementsMap.values()) {
      if (
        isElementInViewport(
          element,
          width,
          height,
          {
            zoom,
            offsetLeft,
            offsetTop,
            scrollX,
            scrollY,
          },
          elementsMap,
        )
      ) {
        visibleElements.push(element);
      }
    }
    return visibleElements;
  }

  private getRenderableElementsMap({
    elements,
    editingTextElement,
    newElement,
  }: {
    elements: readonly NonDeletedExcalidrawElement[];
    editingTextElement: AppState["editingTextElement"];
    newElement: AppState["newElement"];
  }) {
    const elementsMap = toBrandedType<RenderableElementsMap>(new Map());
    const newElementCanvasElement = newElement?.frameId ? null : newElement;

    for (const element of elements) {
      if (newElementCanvasElement?.id === element.id) {
        continue;
      }

      // we don't want to render text element that's being currently edited
      // (it's rendered on remote only)
      if (
        !editingTextElement ||
        editingTextElement.type !== "text" ||
        element.id !== editingTextElement.id
      ) {
        elementsMap.set(element.id, element);
      }
    }
    return { elementsMap, newElementCanvasElement };
  }

  private sortSelectedElementsIntoHighlightedFrame<
    T extends ExcalidrawElement,
  >({
    visibleElements,
    selectedElements,
    frameToHighlight,
  }: {
    selectedElements: readonly NonDeletedExcalidrawElement[];
    visibleElements: readonly T[];
    frameToHighlight: NonDeleted<ExcalidrawFrameLikeElement>;
  }): readonly T[] {
    if (!selectedElements.length) {
      return visibleElements;
    }

    // we assume all selected elements are eligible frame children if
    // frameToHighlight is defined
    const selectedElementsMap = arrayToMap(selectedElements);

    // thus, all deselected elements are the ones we won't reorder
    const deselectedElements = visibleElements.filter(
      (element) => !selectedElementsMap.has(element.id),
    );

    const insertionIndex = getFrameChildrenInsertionIndex(
      deselectedElements,
      frameToHighlight.id,
    );

    if (insertionIndex === null) {
      return visibleElements;
    }

    return [
      ...deselectedElements.slice(0, insertionIndex),
      ...selectedElements,
      ...deselectedElements.slice(insertionIndex),
    ] as readonly T[];
  }

  private _getRenderableElements = memoize(
    ({
      canvasNonce,
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
      height,
      width,
      editingTextElement,
      newElement,
    }: Omit<
      GetRenderableElementsOpts,
      | "selectedElements"
      | "selectedElementsAreBeingDragged"
      | "frameToHighlight"
    > & {
      canvasNonce: string;
    }) => {
      const elements = this.scene.getNonDeletedElements();

      const { elementsMap, newElementCanvasElement } =
        this.getRenderableElementsMap({
          elements,
          editingTextElement,
          newElement,
        });

      const visibleElements = this.getVisibleCanvasElements({
        elementsMap,
        zoom,
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
        height,
        width,
      });

      return {
        elementsMap,
        visibleElements,
        newElementCanvasElement,
        canvasNonce,
      };
    },
  );

  /**
   * sdamex: nonce for the static canvas. It changes only when the static
   * output can change for element reasons (see `StaticContentSnapshot`):
   * the visible elements (ids, order, version, versionNonce), their
   * containing frames, the bound text drawn with each container (renderable
   * map), arrow labels (full scene map), or an explicit
   * `scene.triggerUpdate()`. A remote batch that touched only off-screen
   * elements keeps it, so the static canvas is not repainted. Viewport and
   * other appState changes are compared by StaticCanvas itself.
   */
  private getStaticCanvasNonce(
    visibleElements: readonly NonDeletedExcalidrawElement[],
    elementsMap: RenderableElementsMap,
  ): string {
    const sceneNonce = this.scene.getSceneNonce();
    const forcedUpdateCount = this.scene.getForcedUpdateCount();
    const allElementsMap = this.scene.getNonDeletedElementsMap();
    const prev = this.staticContent;

    // the memoized result was reused and nothing notified since
    if (
      prev &&
      prev.visibleElements === visibleElements &&
      prev.sceneNonce === sceneNonce &&
      prev.snapshot.forcedUpdateCount === forcedUpdateCount
    ) {
      return `${prev.nonce}`;
    }

    if (
      prev &&
      isSameStaticContent(
        prev.snapshot,
        visibleElements,
        elementsMap,
        allElementsMap,
        forcedUpdateCount,
      )
    ) {
      this.staticContent = { ...prev, visibleElements, sceneNonce };
      return `${prev.nonce}`;
    }

    const nonce = ++staticCanvasNonceCounter;
    this.staticContent = {
      visibleElements,
      sceneNonce,
      snapshot: snapshotStaticContent(
        visibleElements,
        elementsMap,
        allElementsMap,
        forcedUpdateCount,
      ),
      nonce,
    };
    return `${nonce}`;
  }

  public getRenderableElements = (opts: GetRenderableElementsOpts) => {
    const { newElement } = opts;
    const canvasNonce = `${this.scene.getSceneNonce()}${
      newElement?.frameId ? `:${newElement.versionNonce}` : ""
    }`;

    const ret = this._getRenderableElements({
      canvasNonce,

      // don't spread `opts` because we don't want to memoize on some props

      zoom: opts.zoom,
      offsetLeft: opts.offsetLeft,
      offsetTop: opts.offsetTop,
      scrollX: opts.scrollX,
      scrollY: opts.scrollY,
      height: opts.height,
      width: opts.width,
      editingTextElement: opts.editingTextElement,
      newElement: opts.newElement,
    });

    // if we're dragging elements over a frame, reorder the selected elements
    // inside the frame during render (we don't set the `element.frameId` until
    // pointerup else we'd have to painstainly restore the orig index if user
    // didn't end up adding elements to the frame)
    if (
      opts.frameToHighlight &&
      opts.selectedElementsAreBeingDragged &&
      // if all dragged elements are already in the frame, don't reorder
      getCommonFrameId(opts.selectedElements) !== opts.frameToHighlight.id
    ) {
      const reorderedVisibleElements =
        this.sortSelectedElementsIntoHighlightedFrame({
          visibleElements: ret.visibleElements,
          selectedElements: opts.selectedElements,
          frameToHighlight: opts.frameToHighlight,
        });

      return {
        ...ret,
        visibleElements: reorderedVisibleElements,
        staticCanvasNonce: this.getStaticCanvasNonce(
          reorderedVisibleElements,
          ret.elementsMap,
        ),
      };
    }

    return {
      ...ret,
      staticCanvasNonce: this.getStaticCanvasNonce(
        ret.visibleElements,
        ret.elementsMap,
      ),
    };
  };

  // NOTE Doesn't destroy everything (scene, rc, etc.) because it may not be
  // safe to break TS contract here (for upstream cases)
  public destroy() {
    renderStaticSceneThrottled.cancel();
    this._getRenderableElements.clear();
    this.staticContent = null;
  }
}
