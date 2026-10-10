import { useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { FidelityWatermark } from './FidelityWatermark';

export interface PptxPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
  /** 工作区相对路径：用于识别旧版 .ppt 二进制格式并给出转存指引 */
  fileName?: string;
}

/** 渲染基准宽度：库按宽度算缩放，基准只决定内部坐标精度，不决定显示尺寸。 */
const PPTX_BASE_WIDTH = 960;

/**
 * 演示文稿预览（第三方：pptx-preview，ISC，
 * https://www.npmjs.com/package/pptx-preview ，懒加载）。
 * 纯前端解析渲染；复杂动画/嵌入对象可能与原稿有差异，UI 侧以 hint 注明保真限度。
 *
 * 尺寸策略（pptx-A）：只解析渲染一次；宽度按容器贴合（k=容器宽/自然宽，
 * 幻灯片有多大就显示多大、可读优先），纵向走原生滚动连续翻页；
 * ResizeObserver 只更新缩放系数——不清空、不重解析，故无闪烁。
 */
export function PptxPreview({ data, theme = 'dark', fileName }: PptxPreviewProps) {
  const { t, formatT } = useTCopy();
  const scalerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [viewport, setViewport] = useState({ scale: 1, left: 0, sizerHeight: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if ((fileName ?? '').toLowerCase().endsWith('.ppt')) {
      setLegacy(true);
      return undefined;
    }
    setLegacy(false);
    return undefined;
  }, [fileName]);

  // 单次渲染：解析一次挂载自然尺寸，后续尺寸变化只走 CSS 缩放。
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || legacy) {
      return undefined;
    }
    let cancelled = false;
    const el: HTMLElement = body;
    el.innerHTML = '';
    setError(null);

    async function renderDeck() {
      try {
        const { init } = await import('pptx-preview');
        if (cancelled) {
          return;
        }
        const viewer = init(el, {
          width: PPTX_BASE_WIDTH,
          mode: 'list',
        });
        await viewer.preview(data.slice(0));
        if (cancelled) {
          return;
        }
        // 自然尺寸取渲染根的实测盒（零尺寸时回退基准宽 + 16:9，保证首屏可缩放）。
        const naturalWidth = el.scrollWidth || PPTX_BASE_WIDTH;
        const naturalHeight = el.scrollHeight || Math.round(PPTX_BASE_WIDTH * 0.5625);
        if (!cancelled) {
          setNaturalSize({ width: naturalWidth, height: naturalHeight });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void renderDeck();
    return () => {
      cancelled = true;
      el.innerHTML = '';
    };
  }, [data, legacy, fileName]);

  // 宽度贴合：k=容器宽/自然宽；纵向原生滚动。只更新系数，不触碰 DOM 内容。
  useEffect(() => {
    const scaler = scalerRef.current;
    if (!scaler || legacy || naturalSize.width <= 0) {
      return undefined;
    }
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const update = () => {
      const stageWidth = scaler.clientWidth;
      if (stageWidth <= 0) {
        return;
      }
      const scale = stageWidth / naturalSize.width;
      const left = Math.max(0, (stageWidth - naturalSize.width * scale) / 2);
      setViewport((prev) => {
        const sizerHeight = naturalSize.height * scale;
        return Math.abs(prev.scale - scale) > 0.001 ||
          Math.abs(prev.left - left) > 0.5 ||
          Math.abs(prev.sizerHeight - sizerHeight) > 0.5
          ? { scale, left, sizerHeight }
          : prev;
      });
    };
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 200);
    });
    observer.observe(scaler);
    update();
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [legacy, naturalSize]);

  if (legacy) {
    return (
      <div className={`adl-pptx-preview adl-pptx-preview--${theme} adl-pptx-preview--error`}>
        <p>{formatT(t, 'officeLegacyFormat', { suggest: '.pptx' })}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`adl-pptx-preview adl-pptx-preview--${theme} adl-pptx-preview--error`}>
        <p>{formatT(t, 'changesPreviewFailedPresentation', { error: String(error) })}</p>
      </div>
    );
  }

  return (
    <div className={`adl-pptx-preview adl-pptx-preview--${theme}`}>
      <FidelityWatermark text={t.presentationFidelityHint as string} fileKey={fileName} />
      <div ref={scalerRef} className="adl-pptx-preview__stage">
        <div className="adl-pptx-preview__sizer" style={{ height: `${viewport.sizerHeight}px` }}>
          <div
            ref={bodyRef}
            className="adl-pptx-preview__body"
            style={
              naturalSize.width > 0
                ? {
                    width: `${naturalSize.width}px`,
                    left: `${viewport.left}px`,
                    transform: `scale(${viewport.scale})`,
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
