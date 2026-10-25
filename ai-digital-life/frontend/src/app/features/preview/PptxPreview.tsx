import { useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { FidelityWatermark } from './FidelityWatermark';
import { PreviewLoadingGate } from './PreviewLoadingGate';
import { isZipUnpackError } from './officeErrors';
import { isLegacyOfficeFile } from '@regions/right-panel/fileTypeRouter';

export interface PptxPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
  /** 工作区相对路径：用于识别旧版 .ppt 二进制格式并给出转存指引 */
  fileName?: string;
  /** 打开预算剩余延迟（由文件面板跨阶段计算） */
  gateDelayMs?: number;
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
export function PptxPreview({ data, theme = 'dark', fileName, gateDelayMs }: PptxPreviewProps) {
  const { t, formatT } = useTCopy();
  const scalerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [viewport, setViewport] = useState({ scale: 1, sizerHeight: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  // 渲染期扫光占位：naturalSize 跨文档保留，不能拿它当"是否已渲染"的判据。
  const [rendering, setRendering] = useState(true);

  // 旧版 .ppt 与 DocxPreview 同式：在渲染 effect 内同步派生，不单独 effect
  //（Phase 4 审查 R-06：独立 effect 会让首轮渲染 effect 读到 stale legacy=false，
  // 白下载懒块并解析一次，虽被 cancelled 丢弃仍浪费）。
  const legacy = useMemo(() => isLegacyOfficeFile(fileName), [fileName]);

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
    setUnreadable(false);
    setRendering(true);

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
          setRendering(false);
        }
      } catch (err) {
        if (!cancelled) {
          setRendering(false);
          const message = err instanceof Error ? err.message : String(err);
          if (isZipUnpackError(message)) {
            setUnreadable(true);
          } else {
            setError(message);
          }
        }
      }
    }

    void renderDeck();
    return () => {
      cancelled = true;
      // pptx-preview 无公开销毁 API（库内无 dispose/destroy/addEventListener/Worker，
      // 已审计 1.0.7 dist 确认；唯一残留是库内为嵌入音视频创建且不 revoke 的
      // object URL，随文档切换累积、页签关闭释放——属已知局限）。
      // innerHTML 清空释放全部 DOM 持有。
      el.innerHTML = '';
    };
  }, [data, legacy]);

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
      // k=容器宽/自然宽时视觉宽度恒等于容器宽，left 恒为 0（不保留居中保留位）。
      const scale = stageWidth / naturalSize.width;
      setViewport((prev) => {
        const sizerHeight = naturalSize.height * scale;
        return Math.abs(prev.scale - scale) > 0.001 ||
          Math.abs(prev.sizerHeight - sizerHeight) > 0.5
          ? { scale, sizerHeight }
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
      <div
        className={`adl-pptx-preview adl-pptx-preview--${theme} adl-pptx-preview--error`}
        role="alert"
      >
        <p>{formatT(t, 'officeLegacyFormat', { suggest: '.pptx' })}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`adl-pptx-preview adl-pptx-preview--${theme} adl-pptx-preview--error`}
        role="alert"
      >
        <p>{formatT(t, 'changesPreviewFailedPresentation', { error: String(error) })}</p>
      </div>
    );
  }

  if (unreadable) {
    return (
      <div
        className={`adl-pptx-preview adl-pptx-preview--${theme} adl-pptx-preview--error`}
        role="alert"
      >
        <p>{t.presentationUnreadable as string}</p>
      </div>
    );
  }

  return (
    <div className={`adl-pptx-preview adl-pptx-preview--${theme}`}>
      <FidelityWatermark
        key={fileName}
        text={t.presentationFidelityHint as string}
        fileKey={fileName}
      />
      <div ref={scalerRef} className="adl-pptx-preview__stage">
        <div className="adl-pptx-preview__sizer" style={{ height: `${viewport.sizerHeight}px` }}>
          <div
            ref={bodyRef}
            className="adl-pptx-preview__body"
            style={
              naturalSize.width > 0
                ? {
                    width: `${naturalSize.width}px`,
                    transform: `scale(${viewport.scale})`,
                  }
                : undefined
            }
          />
        </div>
      </div>
      {/* 不对 pptx 做渲染结果缓存：库会为内嵌音视频创建 object URL，缓存 innerHTML 会在卸载后失效/串播。 */}
      <PreviewLoadingGate active={rendering} delayMs={gateDelayMs} overlay />
    </div>
  );
}
