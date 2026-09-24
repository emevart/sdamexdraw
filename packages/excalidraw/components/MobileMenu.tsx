import React from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { actionToggleViewMode } from "../actions/actionToggleViewMode";
import { useTunnels } from "../context/tunnels";
import { t } from "../i18n";
import { getScrollToContentState } from "../scene";
import { SCROLLBAR_WIDTH, SCROLLBAR_MARGIN } from "../scene/scrollbars";

import { ExitViewModeButton } from "./Actions";
import { MobileToolbar } from "./MobileToolbar";
import { FixedSideContainer } from "./FixedSideContainer";

import { Island } from "./Island";

import { PenModeButton } from "./PenModeButton";

import type { ActionManager } from "../actions/manager";
import type {
  AppClassProperties,
  AppProps,
  AppState,
  UIAppState,
} from "../types";
import type { JSX } from "react";

type MobileMenuProps = {
  appState: UIAppState;
  actionManager: ActionManager;
  renderJSONExportDialog: () => React.ReactNode;
  renderImageExportDialog: () => React.ReactNode;
  setAppState: React.Component<any, AppState>["setState"];
  elements: readonly NonDeletedExcalidrawElement[];
  onHandToolToggle: () => void;
  onPenModeToggle: AppClassProperties["togglePenMode"];

  renderTopRightUI?: (
    isMobile: boolean,
    appState: UIAppState,
  ) => JSX.Element | null;
  renderTopLeftUI?: (
    isMobile: boolean,
    appState: UIAppState,
  ) => JSX.Element | null;
  renderSidebars: () => JSX.Element | null;
  renderWelcomeScreen: boolean;
  UIOptions: AppProps["UIOptions"];
  app: AppClassProperties;
  isHighlighterMode: boolean;
};

export const MobileMenu = ({
  appState,
  elements,
  actionManager,
  setAppState,
  onHandToolToggle,
  renderTopLeftUI,
  renderTopRightUI,
  renderSidebars,
  renderWelcomeScreen,
  UIOptions,
  app,
  isHighlighterMode,
  onPenModeToggle,
}: MobileMenuProps) => {
  const { WelcomeScreenCenterTunnel, MainMenuTunnel } = useTunnels();
  const renderAppTopBar = () => {
    if (appState.openDialog?.name === "elementLinkSelector") {
      return null;
    }

    const topRightUI = (
      <div className="excalidraw-ui-top-right">
        {renderTopRightUI?.(true, appState) ??
          (!appState.viewModeEnabled && (
            <>
              <PenModeButton
                checked={appState.penMode}
                onChange={() => onPenModeToggle(null)}
                title={t("toolBar.penMode")}
                isMobile
                penDetected={appState.penDetected}
              />
            </>
          ))}
        {/* sdamex: when the host sets viewModeEnabled the prop wins over the
            action result (syncActionResult), so the button could not leave
            view mode; show it only while the action is enabled (#5069) */}
        {appState.viewModeEnabled &&
          actionManager.isActionEnabled(actionToggleViewMode) && (
            <ExitViewModeButton actionManager={actionManager} />
          )}
      </div>
    );

    const topLeftUI = (
      <div className="excalidraw-ui-top-left">
        {renderTopLeftUI?.(true, appState)}
        <MainMenuTunnel.Out />
      </div>
    );

    return (
      <div
        className="App-toolbar-content"
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        {topLeftUI}
        {topRightUI}
      </div>
    );
  };

  const renderToolbar = () => {
    return (
      <MobileToolbar
        app={app}
        isHighlighterMode={isHighlighterMode}
        onHandToolToggle={onHandToolToggle}
        setAppState={setAppState}
        renderAction={actionManager.renderAction}
      />
    );
  };

  return (
    <>
      {renderSidebars()}
      {/* welcome screen, bottom bar, and top bar all have the same z-index */}
      {/* ordered in this reverse order so that top bar is on top */}
      <div className="App-welcome-screen">
        {renderWelcomeScreen && <WelcomeScreenCenterTunnel.Out />}
      </div>

      {!appState.viewModeEnabled && (
        <div
          className="App-bottom-bar"
          style={{
            marginBottom: SCROLLBAR_WIDTH + SCROLLBAR_MARGIN,
          }}
          data-viewport-ui="bottom"
        >
          <Island className="App-toolbar">
            {!appState.viewModeEnabled &&
              appState.openDialog?.name !== "elementLinkSelector" &&
              renderToolbar()}
            {appState.scrolledOutside &&
              !appState.openMenu &&
              !appState.openSidebar && (
                <button
                  type="button"
                  className="scroll-back-to-content"
                  onClick={() => {
                    setAppState((appState) => ({
                      ...getScrollToContentState(elements, appState),
                    }));
                  }}
                >
                  {t("buttons.scrollBackToContent")}
                </button>
              )}
          </Island>
        </div>
      )}

      <FixedSideContainer side="top" className="App-top-bar">
        {renderAppTopBar()}
      </FixedSideContainer>
    </>
  );
};
