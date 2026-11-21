import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useMediaSession } from './useMediaSession';
import {
  clampZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP_BUTTON,
  ZOOM_STEP_WHEEL,
} from './mediaZoomLimits';

export type MediaZoomKind = 'image' | 'video';

export interface MediaZoomViewportProps {
  kind: MediaZoomKind;
  /** Range 流式端点 URL（直接作 `<img>/<video>` 的 src）。 */
  src: string;
  /** 图片替代文本；视频不用。 */
  alt: string;
  /** 系统媒体卡片标题（视频用；图片忽略）。 */
  mediaTitle?: string;
  onRenderError: () => void;
}

/** 拖拽判定阈值：小于它视为点击（视频要保留播放/暂停）。 */
const DRAG_THRESHOLD_PX = 4;

interface Point {
  x: number;
  y: number;
}

interface ZoomView {
  zoom: number;
  offset: Point;
}

const INITIAL_VIEW: ZoomView = { zoom: 1, offset: { x: 0, y: 0 } };

/**
 * 图片/视频的缩放视区（事项 14）。
 *
 * 口径（用户已确认）：
 * - 100% = 适配可视区（打开即 100%，大图自动缩小；改窗口大小仍是 100%）；
 * - Ctrl/⌘ + 滚轮按**指针位置**锚定缩放，按钮按视区中心缩放，百分比按钮复位到 100%；
 * - 放大后可**拖拽平移**（小位移视为点击，保留视频原生播放/暂停）；
 * - 范围 10%–800%，按钮 ×1.25 / 滚轮 ×1.1；
 * - 切换文件不保留缩放（回到 100%）。
 *
 * 实现：视区固定，内层 stage 用 `translate(x,y) scale(z)`、`transform-origin: center`
 * 变换；图片/视频在 stage 内 `object-fit: contain`，letterbox 对称，因此指针锚点只需
 * 视区中心，无需测量媒体原始像素。
 */
export function MediaZoomViewport({
  kind,
  src,
  alt,
  mediaTitle,
  onRenderError,
}: MediaZoomViewportProps) {
  const { t } = useTCopy();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // 视频播放时把歌名/动作接进 Windows 系统媒体卡片（事项 17）。
  useMediaSession(videoRef, { title: mediaTitle ?? alt }, kind === 'video');
  const [view, setView] = useState<ZoomView>(INITIAL_VIEW);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    active: boolean;
  } | null>(null);

  // 换文件即复位（Q12：不跨文件保留缩放）。
  useEffect(() => {
    setView(INITIAL_VIEW);
    setDragging(false);
    dragRef.current = null;
  }, [src]);

  const readViewport = useCallback((): { width: number; height: number } => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return { width: 0, height: 0 };
    }
    return { width: viewport.clientWidth, height: viewport.clientHeight };
  }, []);

  const clampOffset = useCallback(
    (next: Point, nextZoom: number, size: { width: number; height: number }): Point => {
      if (nextZoom <= 1) {
        return { x: 0, y: 0 };
      }
      // stage 尺寸 == 视区尺寸，放大后每边可移动 (size * (zoom - 1)) / 2，
      // 夹在范围内可保证不会把画面拖出可视区。
      const maxX = (size.width * (nextZoom - 1)) / 2;
      const maxY = (size.height * (nextZoom - 1)) / 2;
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [],
  );

  /** 以视区内的一个锚点缩放（缺省 = 视区中心，按钮路径）。 */
  const zoomAt = useCallback(
    (factor: number, anchor?: Point) => {
      const size = readViewport();
      const centerX = size.width / 2;
      const centerY = size.height / 2;
      const anchorX = anchor?.x ?? centerX;
      const anchorY = anchor?.y ?? centerY;
      setView((current) => {
        const nextZoom = clampZoom(current.zoom * factor);
        if (nextZoom === current.zoom) {
          return current;
        }
        // 让锚点下的内容在缩放前后保持不动（中心原点的等价位移）。
        const ratio = nextZoom / current.zoom;
        const nextOffset = clampOffset(
          {
            x: current.offset.x + (anchorX - centerX) * (1 - ratio),
            y: current.offset.y + (anchorY - centerY) * (1 - ratio),
          },
          nextZoom,
          size,
        );
        return { zoom: nextZoom, offset: nextOffset };
      });
    },
    [clampOffset, readViewport],
  );

  const resetZoom = useCallback(() => {
    setView(INITIAL_VIEW);
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      // 只认 Ctrl/⌘ + 滚轮（触控板捏合同源）；普通滚轮保持默认行为（Q7）。
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? ZOOM_STEP_WHEEL : 1 / ZOOM_STEP_WHEEL, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    [zoomAt],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (view.zoom <= 1 || event.button !== 0) {
        return;
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: view.offset.x,
        originY: view.offset.y,
        active: false,
      };
    },
    [view.offset.x, view.offset.y, view.zoom],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          return;
        }
        drag.active = true;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      const size = readViewport();
      setView((current) => ({
        zoom: current.zoom,
        offset: clampOffset({ x: drag.originX + dx, y: drag.originY + dy }, current.zoom, size),
      }));
    },
    [clampOffset, readViewport],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const stageStyle = useMemo(
    () => ({ transform: `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.zoom})` }),
    [view.offset.x, view.offset.y, view.zoom],
  );
  const percent = Math.round(view.zoom * 100);
  const canPan = view.zoom > 1;

  return (
    <div
      ref={viewportRef}
      className={`adl-media-zoom${canPan ? ' is-zoomed' : ''}${dragging ? ' is-dragging' : ''}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-testid="media-zoom-viewport"
    >
      <div className="adl-media-zoom__stage" style={stageStyle}>
        {kind === 'image' ? (
          <img src={src} alt={alt} draggable={false} onError={onRenderError} />
        ) : (
          <video
            ref={videoRef}
            controls
            preload="metadata"
            playsInline
            src={src}
            onError={onRenderError}
            onDoubleClick={resetZoom}
          />
        )}
      </div>
      {/* 悬浮胶囊：与 PDF 翻页胶囊同款（药丸、悬停显现、聚焦/触屏常驻）。 */}
      <div className="adl-media-zoom-nav" data-testid="media-zoom-nav">
        <button
          type="button"
          className="adl-media-zoom-nav__step"
          disabled={view.zoom <= ZOOM_MIN}
          onClick={() => zoomAt(1 / ZOOM_STEP_BUTTON)}
          title={t.mediaZoomOut as string}
          aria-label={t.mediaZoomOut as string}
        >
          −
        </button>
        <button
          type="button"
          className="adl-media-zoom-nav__count"
          onClick={resetZoom}
          title={t.mediaZoomReset as string}
          aria-label={`${percent}%`}
        >
          {percent}%
        </button>
        <button
          type="button"
          className="adl-media-zoom-nav__step"
          disabled={view.zoom >= ZOOM_MAX}
          onClick={() => zoomAt(ZOOM_STEP_BUTTON)}
          title={t.mediaZoomHint as string}
          aria-label={t.mediaZoomIn as string}
        >
          +
        </button>
      </div>
    </div>
  );
}
