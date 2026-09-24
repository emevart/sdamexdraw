import clsx from "clsx";

import { isTextElement } from "@excalidraw/element";

import { capitalizeString } from "@excalidraw/common";

import type {
  NonDeletedElementsMap,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { trackEvent } from "../analytics";

import { t } from "../i18n";

import { getTargetElements } from "../scene";

import {
  canChangeStrokeColor,
  canChangeBackgroundColor,
  CombinedShapeProperties,
  CombinedArrowProperties,
  CombinedTextProperties,
  CombinedExtraActions,
  LinearEditorAction,
} from "./Actions";
import { useExcalidrawContainer } from "./App";
import { ToolButton } from "./ToolButton";

import {
  SelectionIcon,
  LassoIcon,
  FreedrawIcon,
  HighlighterIcon,
  RectangleIcon,
  DiamondIcon,
  EllipseIcon,
  TriangleIcon,
  PentagonIcon,
  HexagonIcon,
  OctagonIcon,
  SemicircleIcon,
  TrapezoidIcon,
  RightTrapezoidIcon,
  RightTriangleIcon,
  PrismIcon,
  PyramidIcon,
  TetrahedronIcon,
  CylinderIcon,
  SphereIcon,
  ConeIcon,
  TriangularPrismIcon,
  BipyramidIcon,
  TruncatedPyramidIcon,
  TruncatedConeIcon,
  ObliqueRectPrismIcon,
  ObliqueTriPrismIcon,
  LineIcon,
  ArrowIcon,
} from "./icons";

import "./MobileSettingsRow.scss";

import type {
  AppClassProperties,
  AppState,
  ToolType,
  UIAppState,
} from "../types";
import type { ActionManager } from "../actions/manager";

/** Separator sentinel */
const SEP = "---";

const SHAPE_VARIANTS = [
  // Basic shapes
  { type: "rectangle", icon: RectangleIcon },
  { type: "ellipse", icon: EllipseIcon },
  { type: "semicircle", icon: SemicircleIcon },
  { type: "triangle", icon: TriangleIcon },
  { type: "rightTriangle", icon: RightTriangleIcon },
  // Quadrilaterals
  { type: "diamond", icon: DiamondIcon },
  { type: "trapezoid", icon: TrapezoidIcon },
  { type: "rightTrapezoid", icon: RightTrapezoidIcon },
  // Regular polygons
  { type: "pentagon", icon: PentagonIcon },
  { type: "hexagon", icon: HexagonIcon },
  { type: "octagon", icon: OctagonIcon },
  { type: SEP },
  // Prisms
  { type: "prism", icon: PrismIcon },
  { type: "triangularPrism", icon: TriangularPrismIcon },
  { type: "obliqueRectPrism", icon: ObliqueRectPrismIcon },
  { type: "obliqueTriPrism", icon: ObliqueTriPrismIcon },
  // Pyramids
  { type: "pyramid", icon: PyramidIcon },
  { type: "tetrahedron", icon: TetrahedronIcon },
  { type: "bipyramid", icon: BipyramidIcon },
  { type: "truncatedPyramid", icon: TruncatedPyramidIcon },
  // Round bodies
  { type: "cylinder", icon: CylinderIcon },
  { type: "cone", icon: ConeIcon },
  { type: "truncatedCone", icon: TruncatedConeIcon },
  { type: "sphere", icon: SphereIcon },
] as const;

const SHAPE_TYPES: Set<string> = new Set(
  SHAPE_VARIANTS.filter((v) => v.type !== SEP).map((v) => v.type),
);

const LINEAR_VARIANTS = [
  { type: "line", icon: LineIcon },
  { type: "arrow", icon: ArrowIcon },
] as const;

const FREEDRAW_VARIANTS = [
  { type: "freedraw", icon: FreedrawIcon },
  { type: "highlighter", icon: HighlighterIcon },
] as const;

const SELECTION_VARIANTS = [
  { type: "selection", icon: SelectionIcon },
  { type: "lasso", icon: LassoIcon },
] as const;

/** Tools that have no settings row */
const TOOLS_WITHOUT_SETTINGS = new Set(["eraser", "hand", "laser"]);

export const MobileSettingsRow = ({
  appState,
  elementsMap,
  renderAction,
  app,
  isHighlighterMode,
  setAppState,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
  isHighlighterMode: boolean;
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const targetElements = getTargetElements(elementsMap, appState);
  const { container } = useExcalidrawContainer();
  const activeType = appState.activeTool.type;

  const hasSettings =
    !TOOLS_WITHOUT_SETTINGS.has(activeType) || targetElements.length > 0;

  const collapsed = !hasSettings;

  // Determine which variants to show based on active tool
  const isShape = SHAPE_TYPES.has(activeType);
  const isLinear = activeType === "line" || activeType === "arrow";
  const isFreedraw = activeType === "freedraw";
  const isSelection = activeType === "selection" || activeType === "lasso";

  const handleVariantChange = (type: string) => {
    if (app.state.activeTool.type !== type && type !== "highlighter") {
      trackEvent("toolbar", type, "ui");
    }

    if (type === "highlighter") {
      app.setHighlighterMode(true);
      app.setActiveTool({ type: "freedraw" });
    } else if (type === "freedraw") {
      app.setHighlighterMode(false);
      app.setActiveTool({ type: "freedraw" });
    } else if (type === "selection" || type === "lasso") {
      app.setActiveTool({ type });
      setAppState({
        preferredSelectionTool: { type, initialized: true },
      });
    } else {
      app.setActiveTool({ type: type as ToolType });
    }
  };

  const isVariantActive = (type: string) => {
    if (type === "highlighter") {
      return activeType === "freedraw" && isHighlighterMode;
    }
    if (type === "freedraw") {
      return activeType === "freedraw" && !isHighlighterMode;
    }
    return activeType === type;
  };

  const getTitle = (type: string) => {
    const key = `toolBar.${type}`;
    try {
      return capitalizeString(t(key as any));
    } catch {
      return capitalizeString(type);
    }
  };

  // Pick which variants to render
  let variants: ReadonlyArray<{ type: string; icon?: React.ReactNode }> = [];
  if (isShape) {
    variants = SHAPE_VARIANTS;
  } else if (isLinear) {
    variants = LINEAR_VARIANTS;
  } else if (isFreedraw) {
    variants = FREEDRAW_VARIANTS;
  } else if (isSelection) {
    variants = SELECTION_VARIANTS;
  }

  return (
    <div
      className={clsx("mobile-settings-row", {
        "mobile-settings-row--collapsed": collapsed,
      })}
    >
      <div className="mobile-settings-row__content">
        {/* Stroke Color */}
        {canChangeStrokeColor(appState, targetElements) && (
          <div className="mobile-settings-row__item compact-action-item">
            {renderAction("changeStrokeColor")}
          </div>
        )}

        {/* Background Color */}
        {canChangeBackgroundColor(appState, targetElements) && (
          <div className="mobile-settings-row__item compact-action-item">
            {renderAction("changeBackgroundColor")}
          </div>
        )}

        {/* Shape Properties (stroke width, fill style, opacity, etc.) */}
        <CombinedShapeProperties
          appState={appState}
          renderAction={renderAction}
          setAppState={setAppState}
          targetElements={targetElements}
          container={container}
        />

        {/* Combined Arrow Properties */}
        <CombinedArrowProperties
          appState={appState}
          renderAction={renderAction}
          setAppState={setAppState}
          targetElements={targetElements}
          container={container}
          app={app}
        />

        {/* Linear Editor */}
        <LinearEditorAction
          appState={appState}
          renderAction={renderAction}
          targetElements={targetElements}
        />

        {/* Text Properties */}
        {(activeType === "text" || targetElements.some(isTextElement)) && (
          <>
            <div className="mobile-settings-row__item compact-action-item">
              {renderAction("changeFontFamily")}
            </div>
            <CombinedTextProperties
              appState={appState}
              renderAction={renderAction}
              setAppState={setAppState}
              targetElements={targetElements}
              container={container}
              elementsMap={elementsMap}
            />
          </>
        )}

        {/* Combined Extra Actions (layers, align, group, etc.) */}
        <CombinedExtraActions
          appState={appState}
          renderAction={renderAction}
          targetElements={targetElements}
          setAppState={setAppState}
          container={container}
          app={app}
          showDuplicate
          showDelete
        />

        {/* Separator before tool variants */}
        {variants.length > 0 && (
          <div className="mobile-settings-row__separator" />
        )}

        {/* Tool variants */}
        {variants.map((variant, idx) => {
          if (variant.type === SEP) {
            return (
              <div
                key={`sep-${idx}`}
                className="mobile-settings-row__separator"
              />
            );
          }

          const active = isVariantActive(variant.type);
          const title = getTitle(variant.type);

          return (
            <ToolButton
              key={variant.type}
              className={clsx("mobile-settings-row__variant", { active })}
              type="radio"
              icon={variant.icon!}
              checked={active}
              name="mobile-tool-variant"
              title={title}
              aria-label={title}
              data-testid={`variant-${variant.type}`}
              onChange={() => handleVariantChange(variant.type)}
            />
          );
        })}
      </div>
    </div>
  );
};
