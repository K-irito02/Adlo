import { useEffect, useRef } from 'react';
import type { BackgroundAdjust, BackgroundFit } from '@stores/slices/browserSlice';
import {
  applyVideoStageConfig,
  registerVideoSurface,
  setVideoSurfaceActive,
  updateVideoSurfaceOptions,
} from './backgroundVideoStage';

interface BackgroundVideoCanvasProps {
  /** 素材标识（同一素材的多个画布共享一个主视频源）。 */
  stageKey: string;
  url: string;
  fit: BackgroundFit;
  adjust: BackgroundAdjust;
  active: boolean;
  muted: boolean;
  volume: number;
}

/**
 * 视频背景的可见面：只负责把共享主视频画到自己的 canvas 上。
 * 解码、进度与音频都在 `backgroundVideoStage` 的单一主视频里。
 */
export function BackgroundVideoCanvas({
  stageKey,
  url,
  fit,
  adjust,
  active,
  muted,
  volume,
}: BackgroundVideoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    return registerVideoSurface(canvas, { fit, adjust });
    // 注册只做一次；fit/adjust 的后续变化由下面的 effect 更新到同一个 surface。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    updateVideoSurfaceOptions(canvasRef.current, { fit, adjust });
  }, [fit, adjust]);

  useEffect(() => {
    applyVideoStageConfig({ key: stageKey, url, muted, volume });
  }, [stageKey, url, muted, volume]);

  useEffect(() => {
    setVideoSurfaceActive(canvasRef.current, active);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="adl-browser-landing-bg adl-browser-landing-bg--video"
      aria-hidden="true"
    />
  );
}
