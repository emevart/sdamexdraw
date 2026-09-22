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
 * renderConfig, which StaticCanvas compares itself.
 *
 * Contract: the static canvas repaints when any element the static paint
 * reads changes object identity, `version` or `versionNonce`, when the
 * visible id list or order changes, or on `scene.triggerUpdate()`. A host
 * mutation that keeps the same object and the same version/versionNonce is
 * not repainted by itself.
 *
 * The elements the static paint reads:
 * - each visible element, in order;
 * - the frame that contains it (renderable map);
 * - the bound text drawn with a container (renderable map), even when the
 *   text itself is not in the visible list;
 * - the label of an arrow (full scene map): the arrow punches its label hole
 *   from `allElementsMap`, also while the label is being edited and
 *   therefore left out of the renderable map.
 *
 * Object identity covers a host that passes a new object without bumping the
 * version (e.g. SdamEx's live peer stroke preview through `updateScene`);
 * version and versionNonce cover an in-place `mutateElement`, which keeps
 * the object. The arrays are parallel to the visible list.
 */
export type StaticContentSnapshot = {
  forcedUpdateCount: number;
  elements: NonDeletedExcalidrawElement[];
  versions: number[];
  versionNonces: number[];
  frames: (ExcalidrawElement | null)[];
  frameVersionNonces: (number | null)[];
  boundTexts: (ExcalidrawElement | null)[];
  boundTextVersionNonces: (number | null)[];
  arrowLabels: (ExcalidrawElement | null)[];
  arrowLabelVersionNonces: (number | null)[];
};

/**
 * sdamex: module-level so that a static canvas nonce is never reissued, even
 * when App replaces the Renderer (componentWillUnmount) or `destroy()` resets
 * it while StaticCanvas keeps its last props (StrictMode remount).
 */
let staticCanvasNonceCounter = 0;

const getFrame = (
  element: NonDeletedExcalidrawElement,
  elementsMap: NonDeletedElementsMap,
): ExcalidrawElement | null =>
  element.frameId ? elementsMap.get(element.frameId) ?? null : null;

const getArrowLabel = (
  element: NonDeletedExcalidrawElement,
  allElementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap,
): ExcalidrawElement | null =>
  isArrowElement(element) ? getBoundTextElement(element, allElementsMap) : null;

const getVersionNonce = (element: ExcalidrawElement | null) =>
  element?.versionNonce ?? null;

/** sdamex: same object and same versionNonce as in the snapshot */
const isSameDependency = (
  current: ExcalidrawElement | null,
  previous: ExcalidrawElement | null,
  previousVersionNonce: number | null,
) => current === previous && getVersionNonce(current) === previousVersionNonce;

export const snapshotStaticContent = (
  visibleElements: readonly NonDeletedExcalidrawElement[],
  elementsMap: NonDeletedElementsMap,
  allElementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap,
  forcedUpdateCount: number,
): StaticContentSnapshot => {
  const frames = visibleElements.map((element) =>
    getFrame(element, elementsMap),
  );
  const boundTexts = visibleElements.map((element) =>
    getBoundTextElement(element, elementsMap),
  );
  const arrowLabels = visibleElements.map((element) =>
    getArrowLabel(element, allElementsMap),
  );
  return {
    forcedUpdateCount,
    elements: visibleElements.slice(),
    versions: visibleElements.map((element) => element.version),
    versionNonces: visibleElements.map((element) => element.versionNonce),
    frames,
    frameVersionNonces: frames.map(getVersionNonce),
    boundTexts,
    boundTextVersionNonces: boundTexts.map(getVersionNonce),
    arrowLabels,
    arrowLabelVersionNonces: arrowLabels.map(getVersionNonce),
  };
};

export const isSameStaticContent = (
  snapshot: StaticContentSnapshot,
  visibleElements: readonly NonDeletedExcalidrawElement[],
  elementsMap: NonDeletedElementsMap,
  allElementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap,
  forcedUpdateCount: number,
): boolean => {
  if (
    snapshot.forcedUpdateCount !== forcedUpdateCount ||
    snapshot.elements.length !== visibleElements.length
  ) {
    return false;
  }
  for (let index = 0; index < visibleElements.length; index++) {
    const element = visibleElements[index];
    if (
      // a different object also covers a different id (list or order change)
      element !== snapshot.elements[index] ||
      element.version !== snapshot.versions[index] ||
      element.versionNonce !== snapshot.versionNonces[index] ||
      !isSameDependency(
        getFrame(element, elementsMap),
        snapshot.frames[index],
        snapshot.frameVersionNonces[index],
      ) ||
      !isSameDependency(
        getBoundTextElement(element, elementsMap),
        snapshot.boundTexts[index],
        snapshot.boundTextVersionNonces[index],
      ) ||
      !isSameDependency(
        getArrowLabel(element, allElementsMap),
        snapshot.arrowLabels[index],
        snapshot.arrowLabelVersionNonces[index],
      )
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
   * output can change for element reasons (see `StaticContentSnapshot` for
   * the contract): an element the static paint reads (visible elements,
   * their containing frames, the bound text drawn with each container,
   * arrow labels) changed object, version or versionNonce, the visible id
   * list or order changed, or an explicit `scene.triggerUpdate()` ran. A
   * remote batch that touched only off-screen elements keeps it, so the
   * static canvas is not repainted. Viewport and other appState changes are
   * compared by StaticCanvas itself.
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
