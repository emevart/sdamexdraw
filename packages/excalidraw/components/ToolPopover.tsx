import React, { useCallback, useEffect, useState } from "react";
import clsx from "clsx";

import { capitalizeString } from "@excalidraw/common";

import { Popover } from "radix-ui";

import { trackEvent } from "../analytics";

import { ToolButton } from "./ToolButton";

import "./ToolPopover.scss";

import { useExcalidrawContainer } from "./App";

import type { AppClassProperties } from "../types";

type ToolOption = {
  type: string;
  icon: React.ReactNode;
  title?: string;
};

type ToolPopoverProps = {
  app: AppClassProperties;
  options: readonly ToolOption[];
  activeTool: { type: string };
  defaultOption: string;
  className?: string;
  namePrefix: string;
  title: string;
  "data-testid": string;
  onToolChange: (type: string) => void;
  displayedOption: ToolOption;
  fillable?: boolean;
  /** When provided, replaces the default setActiveTool+onToolChange in popup */
  onSelect?: (type: string) => void;
  /** Override popup distance from anchor/trigger (default: 26) */
  sideOffset?: number;
  /** Anchor element ref — popup positions relative to this instead of trigger */
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Notifies the parent when the popup opens or closes. */
  onOpenChange?: (isOpen: boolean) => void;
};

export const ToolPopover = ({
  app,
  options,
  activeTool,
  defaultOption,
  className = "Shape",
  namePrefix,
  title,
  "data-testid": dataTestId,
  onToolChange,
  displayedOption,
  fillable = false,
  onSelect,
  sideOffset: sideOffsetProp,
  anchorRef,
  onOpenChange,
}: ToolPopoverProps) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const currentType = activeTool.type;
  const isActive = displayedOption.type === currentType;
  const SIDE_OFFSET = sideOffsetProp ?? 32 / 2 + 10;
  const { container } = useExcalidrawContainer();

  const handlePopupOpenChange = useCallback(
    (isOpen: boolean) => {
      setIsPopupOpen(isOpen);
      onOpenChange?.(isOpen);
    },
    [onOpenChange],
  );

  // if currentType is not in options, close popup
  useEffect(() => {
    if (!options.some((o) => o.type === currentType) && isPopupOpen) {
      handlePopupOpenChange(false);
    }
  }, [currentType, handlePopupOpenChange, isPopupOpen, options]);

  // Close popover when user starts interacting with the canvas (pointer down)
  useEffect(() => {
    // app.onPointerDownEmitter emits when pointer down happens on canvas area
    const unsubscribe = app.onPointerDownEmitter.on(() => {
      handlePopupOpenChange(false);
    });
    return () => unsubscribe?.();
  }, [app, handlePopupOpenChange]);

  useEffect(
    () => () => {
      onOpenChange?.(false);
    },
    [onOpenChange],
  );

  // Close the popup on Escape ourselves. The Popover.Root is fully controlled
  // (no onOpenChange), so Radix's DismissableLayer never dismisses the popup on
  // its own. Wiring onOpenChange back would let Radix close the popup on the
  // focus-outside events that a normal trigger click produces (the radio input
  // focuses, then App.setActiveTool() calls focusContainer()), which closed the
  // picker immediately after opening. Handle Escape manually instead so the
  // keyboard-dismiss behaviour is preserved without the focus-outside race.
  useEffect(() => {
    if (!isPopupOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handlePopupOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isPopupOpen, handlePopupOpenChange]);

  return (
    <Popover.Root open={isPopupOpen}>
      {anchorRef?.current && (
        <Popover.Anchor
          virtualRef={anchorRef as React.RefObject<HTMLElement>}
        />
      )}
      <Popover.Trigger asChild>
        <ToolButton
          className={clsx(className, {
            fillable,
            active: options.some((o) => o.type === activeTool.type),
          })}
          type="radio"
          icon={displayedOption.icon}
          checked={isActive}
          name="editor-current-shape"
          title={title}
          aria-label={title}
          data-testid={dataTestId}
          onPointerDown={() => {
            handlePopupOpenChange(!isPopupOpen);
            onToolChange(defaultOption);
          }}
        />
      </Popover.Trigger>

      <Popover.Content
        className="tool-popover-content"
        side="top"
        sideOffset={SIDE_OFFSET}
        collisionBoundary={container ?? undefined}
      >
        {options.map(({ type, icon, title }, idx) =>
          type === "---" ? (
            <div key={`sep-${idx}`} className="tool-popover-separator" />
          ) : (
            <ToolButton
              className={clsx(className, {
                active: currentType === type,
              })}
              key={type}
              type="radio"
              icon={icon}
              checked={currentType === type}
              name={`${namePrefix}-option`}
              title={title || capitalizeString(type)}
              keyBindingLabel=""
              aria-label={title || capitalizeString(type)}
              data-testid={`toolbar-${type}`}
              onChange={() => {
                if (onSelect) {
                  onSelect(type);
                } else {
                  if (app.state.activeTool.type !== type) {
                    trackEvent("toolbar", type, "ui");
                  }
                  app.setActiveTool({ type: type as any });
                  onToolChange?.(type);
                }
                // Radix no longer dismisses the popup for us (the Root is fully
                // controlled), so close it explicitly once an option is picked.
                handlePopupOpenChange(false);
              }}
            />
          ),
        )}
      </Popover.Content>
    </Popover.Root>
  );
};
