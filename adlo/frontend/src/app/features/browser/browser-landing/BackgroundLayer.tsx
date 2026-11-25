import type { CSSProperties } from 'react';
import type { BackgroundConfig } from '@stores/slices/browserSlice';
import { BackgroundVideoCanvas } from './BackgroundVideoCanvas';
import { backgroundSourceKey } from './backgroundAssets';
import { useBackgroundMediaUrl } from './useBackgroundMedia';
import './BackgroundLayer.css';

interface BackgroundLayerProps {
  config: BackgroundConfig;
  /**
   * 宿主是否可见。右侧面板收起、切到非浏览器工具、中心被浮层遮挡时传 `false`：
   * 视频面停止绘制并静音（主视频仍在后台播放，保证切回来进度连续）。
   */
  active?: boolean;
  /** 视频是否静音；默认静音起步（自动播放策略要求），由音量控件解除。 */
  muted?: boolean;
}

const DEFAULT_ADJUST = { scale: 1, offsetX: 0, offsetY: 0 };

function clampVolume(volume: number | undefined): number {
  if (typeof volume !== 'number' || !Number.isFinite(volume)) {
    return 0;
  }
  return Math.min(1, Math.max(0, volume));
}

/** 自由调整：以容器中心为原点缩放，再按容器百分比平移（三种填充模式都可用）。 */
function adjustTransform(config: BackgroundConfig): string {
  const adjust = config.adjust ?? DEFAULT_ADJUST;
  const scale = Number.isFinite(adjust.scale) ? Math.min(5, Math.max(0.25, adjust.scale)) : 1;
  const offsetX = Number.isFinite(adjust.offsetX) ? Math.min(50, Math.max(-50, adjust.offsetX)) : 0;
  const offsetY = Number.isFinite(adjust.offsetY) ? Math.min(50, Math.max(-50, adjust.offsetY)) : 0;
  return `translate(${offsetX}%, ${offsetY}%) scale(${scale})`;
}

function imageFitClass(fit: BackgroundConfig['fit']): string {
  if (fit === 'contain') {
    return 'adl-browser-landing-bg--contain';
  }
  if (fit === 'repeat') {
    return 'adl-browser-landing-bg--repeat';
  }
  return 'adl-browser-landing-bg--image';
}

export function BackgroundLayer({ config, active = true, muted = true }: BackgroundLayerProps) {
  const { url } = useBackgroundMediaUrl(config);
  const volume = clampVolume(config.volume);

  if (config.mode === 'image' && url) {
    const style: CSSProperties = {
      backgroundImage: `url(${url})`,
      transform: adjustTransform(config),
    };
    return <div className={`adl-browser-landing-bg ${imageFitClass(config.fit)}`} style={style} />;
  }

  if (config.mode === 'video' && url) {
    const stageKey = backgroundSourceKey(config);
    if (!stageKey) {
      return <div className="adl-browser-landing-bg adl-browser-landing-bg--default" />;
    }
    return (
      <BackgroundVideoCanvas
        stageKey={stageKey}
        url={url}
        fit={config.fit}
        adjust={config.adjust ?? DEFAULT_ADJUST}
        active={active}
        muted={muted}
        volume={volume}
      />
    );
  }

  return <div className="adl-browser-landing-bg adl-browser-landing-bg--default" />;
}
