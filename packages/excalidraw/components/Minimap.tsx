import clsx from "clsx";
import { memo, useCallback, useEffect, useRef } from "react";

import { THEME } from "@excalidraw/common";
import { getCommonBounds } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  useAppStateValue,
  useOnAppStateChange,
} from "../hooks/useAppStateValue";
import { t } from "../i18n";

import { useApp } from "./App";
import { MinimapIcon } from "./icons";
import { Tooltip } from "./Tooltip";

import "./Minimap.scss";

const MINIMAP_WIDTH = 150;
const MINIMAP_HEIGHT = 100;
const PADDING = 10;

export interface MinimapViewport {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: { value: number };
}

export interface MinimapLayout {
  vpMinX: number;
  vpMinY: number;
  vpMaxX: number;
  vpMaxY: number;
  sceneMinX: number;
  sceneMinY: number;
  sceneMaxX: number;
  sceneMaxY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  toMiniX: (sx: number) => number;
  toMiniY: (sy: number) => number;
}

/** Computes minimap scene/viewport bounds and coordinate transforms. */
export const computeMinimapLayout = (
  elements: readonly ExcalidrawElement[],
  viewport: MinimapViewport,
): MinimapLayout => {
  const zoomVal = viewport.zoom.value || 1;
  const vpMinX = -viewport.scrollX;
  const vpMinY = -viewport.scrollY;
  const vpMaxX = vpMinX + viewport.width / zoomVal;
  const vpMaxY = vpMinY + viewport.height / zoomVal;

  let sceneMinX = vpMinX;
  let sceneMinY = vpMinY;
  let sceneMaxX = vpMaxX;
  let sceneMaxY = vpMaxY;

  if (elements.length > 0) {
    const [elMinX, elMinY, elMaxX, elMaxY] = getCommonBounds(elements);
    sceneMinX = Math.min(sceneMinX, elMinX);
    sceneMinY = Math.min(sceneMinY, elMinY);
    sceneMaxX = Math.max(sceneMaxX, elMaxX);
    sceneMaxY = Math.max(sceneMaxY, elMaxY);
  }

  const sceneW = sceneMaxX - sceneMinX || 1;
  const sceneH = sceneMaxY - sceneMinY || 1;
  const padScene = Math.max(sceneW, sceneH) * (PADDING / MINIMAP_WIDTH);
  sceneMinX -= padScene;
  sceneMinY -= padScene;
  sceneMaxX += padScene;
  sceneMaxY += padScene;

  const totalW = sceneMaxX - sceneMinX;
  const totalH = sceneMaxY - sceneMinY;

  const scale = Math.min(MINIMAP_WIDTH / totalW, MINIMAP_HEIGHT / totalH);
  const drawW = totalW * scale;
  const drawH = totalH * scale;
  const offsetX = (MINIMAP_WIDTH - drawW) / 2;
  const offsetY = (MINIMAP_HEIGHT - drawH) / 2;

  return {
    vpMinX,
    vpMinY,
    vpMaxX,
    vpMaxY,
    sceneMinX,
    sceneMinY,
    sceneMaxX,
    sceneMaxY,
    scale,
    offsetX,
    offsetY,
    toMiniX: (sx: number) => offsetX + (sx - sceneMinX) * scale,
    toMiniY: (sy: number) => offsetY + (sy - sceneMinY) * scale,
  };
};

/**
 * Draw element shape on minimap canvas.
 * Uses actual geometry instead of bounding boxes for accuracy.
 */
const drawElement = (
  ctx: CanvasRenderingContext2D,
  el: ExcalidrawElement,
  toX: (sx: number) => number,
  toY: (sy: number) => number,
  scale: number,
  strokeColor: string,
  fillColor: string,
) => {
  const opacity = (el.opacity ?? 100) / 100;
  ctx.globalAlpha = opacity * 0.7;

  switch (el.type) {
    case "rectangle":
    case "image":
    case "frame":
    case "magicframe":
    case "embeddable": {
      const x = toX(el.x);
      const y = toY(el.y);
      const w = el.width * scale;
      const h = el.height * scale;
      if (el.backgroundColor && el.backgroundColor !== "transparent") {
        ctx.fillStyle = el.backgroundColor;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = el.strokeColor || strokeColor;
      ctx.lineWidth = Math.max(el.strokeWidth * scale, 0.5);
      ctx.strokeRect(x, y, w, h);
      break;
    }

    case "diamond": {
      const cx = toX(el.x + el.width / 2);
      const cy = toY(el.y + el.height / 2);
      const hw = (el.width * scale) / 2;
      const hh = (el.height * scale) / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      if (el.backgroundColor && el.backgroundColor !== "transparent") {
        ctx.fillStyle = el.backgroundColor;
        ctx.fill();
      }
      ctx.strokeStyle = el.strokeColor || strokeColor;
      ctx.lineWidth = Math.max(el.strokeWidth * scale, 0.5);
      ctx.stroke();
      break;
    }

    case "ellipse": {
      const cx = toX(el.x + el.width / 2);
      const cy = toY(el.y + el.height / 2);
      const rx = (el.width * scale) / 2;
      const ry = (el.height * scale) / 2;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        Math.max(rx, 0.5),
        Math.max(ry, 0.5),
        0,
        0,
        Math.PI * 2,
      );
      if (el.backgroundColor && el.backgroundColor !== "transparent") {
        ctx.fillStyle = el.backgroundColor;
        ctx.fill();
      }
      ctx.strokeStyle = el.strokeColor || strokeColor;
      ctx.lineWidth = Math.max(el.strokeWidth * scale, 0.5);
      ctx.stroke();
      break;
    }

    case "freedraw": {
      const points = (el as any).points as readonly [number, number][];
      if (!points || points.length < 2) {
        break;
      }
      ctx.beginPath();
      ctx.moveTo(toX(el.x + points[0][0]), toY(el.y + points[0][1]));
      // For performance, skip points on very dense strokes
      const step = points.length > 100 ? Math.floor(points.length / 50) : 1;
      for (let i = step; i < points.length; i += step) {
        ctx.lineTo(toX(el.x + points[i][0]), toY(el.y + points[i][1]));
      }
      // Always include last point
      const last = points[points.length - 1];
      ctx.lineTo(toX(el.x + last[0]), toY(el.y + last[1]));
      ctx.strokeStyle = el.strokeColor || strokeColor;
      ctx.lineWidth = Math.max(el.strokeWidth * scale * 0.5, 0.5);
      ctx.stroke();
      break;
    }

    case "line":
    case "arrow": {
      const points = (el as any).points as readonly [number, number][];
      if (!points || points.length < 2) {
        break;
      }
      ctx.beginPath();
      ctx.moveTo(toX(el.x + points[0][0]), toY(el.y + points[0][1]));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(toX(el.x + points[i][0]), toY(el.y + points[i][1]));
      }
      ctx.strokeStyle = el.strokeColor || strokeColor;
      ctx.lineWidth = Math.max(el.strokeWidth * scale, 0.5);
      ctx.stroke();
      break;
    }

    case "text": {
      // Text too small to read — render as a filled block
      const x = toX(el.x);
      const y = toY(el.y);
      const w = el.width * scale;
      const h = el.height * scale;
      ctx.fillStyle = el.strokeColor || fillColor;
      ctx.globalAlpha = opacity * 0.4;
      ctx.fillRect(x, y, Math.max(w, 1), Math.max(h, 2));
      break;
    }

    default: {
      // Fallback: bounding box from element dimensions
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = opacity * 0.3;
      ctx.fillRect(
        toX(el.x),
        toY(el.y),
        Math.max(el.width * scale, 1),
        Math.max(el.height * scale, 1),
      );
      break;
    }
  }

  ctx.globalAlpha = 1;
};

interface OffscreenCache {
  key: string;
  canvas: HTMLCanvasElement;
}

const Minimap = memo(() => {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCacheRef = useRef<OffscreenCache | null>(null);
  const isDraggingRef = useRef(false);
  const rafIdRef = useRef<number>(0);

  const render = useCallback(() => {
    rafIdRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(MINIMAP_WIDTH * dpr);
    const targetH = Math.round(MINIMAP_HEIGHT * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { state } = app;
    const elements = app.scene.getNonDeletedElements();
    const sceneNonce = app.scene.getSceneNonce();
    const isDark = state.theme === THEME.DARK;
    const bgColor =
      state.viewBackgroundColor || (isDark ? "#121212" : "#ffffff");
    const layout = computeMinimapLayout(elements, state);

    const cacheKey = `${sceneNonce ?? "none"}|${
      state.theme
    }|${bgColor}|${dpr}|${layout.sceneMinX}|${layout.sceneMinY}|${
      layout.sceneMaxX
    }|${layout.sceneMaxY}`;
    let offscreen = offscreenCacheRef.current;
    if (!offscreen || offscreen.key !== cacheKey) {
      const cacheCanvas = offscreen?.canvas ?? document.createElement("canvas");
      if (cacheCanvas.width !== targetW || cacheCanvas.height !== targetH) {
        cacheCanvas.width = targetW;
        cacheCanvas.height = targetH;
      }
      const offCtx = cacheCanvas.getContext("2d");
      if (offCtx) {
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        offCtx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
        offCtx.fillStyle = bgColor;
        offCtx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

        const defaultStroke = isDark
          ? "rgba(255,255,255,0.6)"
          : "rgba(0,0,0,0.5)";
        const defaultFill = isDark
          ? "rgba(255,255,255,0.3)"
          : "rgba(0,0,0,0.25)";

        for (const el of elements) {
          if (el.isDeleted) {
            continue;
          }
          drawElement(
            offCtx,
            el,
            layout.toMiniX,
            layout.toMiniY,
            layout.scale,
            defaultStroke,
            defaultFill,
          );
        }
      }
      offscreen = { key: cacheKey, canvas: cacheCanvas };
      offscreenCacheRef.current = offscreen;
    }

    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
    ctx.drawImage(offscreen.canvas, 0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Draw viewport rectangle
    const vx = layout.toMiniX(layout.vpMinX);
    const vy = layout.toMiniY(layout.vpMinY);
    const vw = (layout.vpMaxX - layout.vpMinX) * layout.scale;
    const vh = (layout.vpMaxY - layout.vpMinY) * layout.scale;

    ctx.fillStyle = isDark ? "rgba(100,149,237,0.12)" : "rgba(59,130,246,0.08)";
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = isDark ? "rgba(100,149,237,0.8)" : "rgba(59,130,246,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);
  }, [app]);

  const scheduleRender = useCallback(() => {
    if (rafIdRef.current) {
      return;
    }
    rafIdRef.current = requestAnimationFrame(render);
  }, [render]);

  useOnAppStateChange(
    [
      "scrollX",
      "scrollY",
      "zoom",
      "width",
      "height",
      "viewBackgroundColor",
      "theme",
    ],
    scheduleRender,
  );

  useEffect(() => {
    scheduleRender();
    const unsubScene = app.scene.onUpdate(scheduleRender);
    return () => {
      try {
        unsubScene();
      } catch {
        // App.componentWillUnmount clears scene callbacks before passive cleanups run.
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [app, scheduleRender]);

  const navigateTo = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const { state } = app;
      const elements = app.scene.getNonDeletedElements();
      const layout = computeMinimapLayout(elements, state);

      const sceneX = layout.sceneMinX + (mx - layout.offsetX) / layout.scale;
      const sceneY = layout.sceneMinY + (my - layout.offsetY) / layout.scale;

      const scrollX = -(sceneX - state.width / (2 * state.zoom.value));
      const scrollY = -(sceneY - state.height / (2 * state.zoom.value));

      app.setAppState({ scrollX, scrollY });
    },
    [app],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      navigateTo(e);
    },
    [navigateTo],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isDraggingRef.current) {
        navigateTo(e);
      }
    },
    [navigateTo],
  );

  const onPointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  return (
    <div className="minimap__canvas-container">
      <canvas
        ref={canvasRef}
        className="minimap__canvas"
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
});

export const MinimapToggle = memo(() => {
  const app = useApp();
  const showMinimap = useAppStateValue("showMinimap");

  const toggle = useCallback(() => {
    app.setAppState({ showMinimap: !app.state.showMinimap });
  }, [app]);

  return (
    <div className="minimap">
      <Tooltip label={t("labels.minimap")}>
        <button
          type="button"
          className={clsx("minimap__toggle", {
            "minimap__toggle--active": showMinimap,
          })}
          onClick={toggle}
          aria-label={t("labels.minimap")}
        >
          {MinimapIcon}
        </button>
      </Tooltip>
      {showMinimap && <Minimap />}
    </div>
  );
});
