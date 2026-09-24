import React from "react";

import { CODES, reseed } from "@excalidraw/common";

import { actionToggleGridSnap } from "../actions/actionToggleGridSnap";
import { t } from "../i18n";
import { Excalidraw } from "../index";
import { isGridModeEnabled } from "../snapping";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import {
  act,
  fireEvent,
  render,
  screen,
  toggleMenu,
  unmountComponent,
  within,
} from "./test-utils";

const { h } = window;

const openPreferences = (container: HTMLElement) => {
  toggleMenu(container);
  const trigger = screen.getByText(t("labels.preferences"));
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: "ArrowRight" });
};

describe("host-controlled toggles (sdamex #5069)", () => {
  beforeEach(() => {
    unmountComponent();
    reseed(7);
  });

  it("hides grid and view mode toggles the host controls and keeps grid snapping", async () => {
    const { container } = await render(
      <Excalidraw gridModeEnabled viewModeEnabled={false} />,
    );
    openPreferences(container);

    expect(screen.queryByText(t("labels.toggleGrid"))).toBeNull();
    expect(screen.queryByText(t("labels.viewMode"))).toBeNull();
    expect(screen.queryByText(t("labels.gridSnap"))).not.toBeNull();
  });

  it("gridModeEnabled={false} hides the grid toggle and grid snapping and wins over state", async () => {
    // хост выключил сетку доски, а в снимке сцены она ещё включена
    const { container } = await render(
      <Excalidraw
        gridModeEnabled={false}
        initialData={{ appState: { gridModeEnabled: true } }}
      />,
    );
    expect(isGridModeEnabled(h.app)).toBe(false);

    openPreferences(container);
    expect(screen.queryByText(t("labels.toggleGrid"))).toBeNull();
    expect(screen.queryByText(t("labels.gridSnap"))).toBeNull();
  });

  it("keeps the toggles when the host does not control them", async () => {
    const { container } = await render(<Excalidraw />);
    openPreferences(container);

    expect(screen.queryByText(t("labels.toggleGrid"))).not.toBeNull();
    expect(screen.queryByText(t("labels.viewMode"))).not.toBeNull();
  });

  it("Alt+S and Ctrl+' keep grid mode on when the host sets it", async () => {
    // the host passes the prop and seeds the same value through initialData,
    // as SdamEx does: initializeScene rebuilds state from initialData only
    await render(
      <Excalidraw
        gridModeEnabled
        handleKeyboardGlobally={true}
        initialData={{ appState: { gridModeEnabled: true } }}
      />,
    );
    expect(h.state.gridModeEnabled).toBe(true);

    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.S);
    });
    expect(h.state.objectsSnapModeEnabled).toBe(true);
    expect(h.state.gridModeEnabled).toBe(true);

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.codePress(CODES.QUOTE);
    });
    expect(h.state.gridModeEnabled).toBe(true);
  });

  it("Alt+S still turns grid mode off without the prop", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    act(() => {
      API.setAppState({ gridModeEnabled: true });
    });

    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.S);
    });
    expect(h.state.gridModeEnabled).toBe(false);
  });

  it("grid snapping follows the effective grid mode", async () => {
    await render(<Excalidraw gridModeEnabled />);
    act(() => {
      API.setAppState({ gridModeEnabled: false });
    });

    expect(h.app.actionManager.isActionEnabled(actionToggleGridSnap)).toBe(
      true,
    );
  });

  // phone layout, set deterministically: the constructor measures before the
  // container exists, refreshEditorInterface() alone does not re-render, and
  // App.onResize is not subscribed in view mode (edit-mode listeners only);
  // refresh and re-render the way the ResizeObserver callback does
  const renderPhone = async (props: { viewModeEnabled?: boolean }) => {
    await render(
      <Excalidraw {...props} UIOptions={{ getFormFactor: () => "phone" }} />,
    );
    act(() => {
      h.app.refreshEditorInterface();
      h.setState({});
    });
    expect(h.app.editorInterface.formFactor).toBe("phone");
  };

  it("a phone viewer gets no dead exit-view-mode button when the host sets view mode", async () => {
    await renderPhone({ viewModeEnabled: true });

    expect(h.state.viewModeEnabled).toBe(true);
    expect(document.querySelector(".disable-view-mode")).toBeNull();
  });

  it("the phone exit-view-mode button still works without the prop", async () => {
    await renderPhone({});
    act(() => {
      API.setAppState({ viewModeEnabled: true });
    });

    const exit = document.querySelector<HTMLElement>(".disable-view-mode");
    expect(exit).not.toBeNull();
    fireEvent.click(exit!);
    expect(h.state.viewModeEnabled).toBe(false);
  });

  // the shortcuts help must not list keys whose action the host switched off
  const openHelp = () => {
    API.setAppState({ openDialog: { name: "help" } });
    const dialog = document.querySelector<HTMLElement>(".HelpDialog");
    expect(dialog).not.toBeNull();
    return within(dialog!);
  };

  it.each([false, true])(
    "the shortcuts help omits grid and view mode the host sets (viewModeEnabled=%s)",
    async (viewModeEnabled) => {
      await render(
        <Excalidraw gridModeEnabled viewModeEnabled={viewModeEnabled} />,
      );
      const help = openHelp();

      expect(help.queryByText(t("buttons.zenMode"))).not.toBeNull();
      expect(help.queryByText(t("labels.toggleGrid"))).toBeNull();
      expect(help.queryByText(t("labels.viewMode"))).toBeNull();
    },
  );

  it("the shortcuts help keeps grid and view mode without the props", async () => {
    await render(<Excalidraw />);
    const help = openHelp();

    expect(help.queryByText(t("labels.toggleGrid"))).not.toBeNull();
    expect(help.queryByText(t("labels.viewMode"))).not.toBeNull();
  });
});
