import { useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { FidelityWatermark } from './FidelityWatermark';
import { PreviewLoadingGate } from './PreviewLoadingGate';
import { createLruCache } from './previewCache';
import { isZipUnpackError } from './officeErrors';
import { isLegacyOfficeFile } from '@regions/right-panel/fileTypeRouter';

export interface DocxPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
  /** 工作区相对路径：用于识别旧版 .doc 二进制格式并给出转存指引 */
  fileName?: string;
  /** 预览缓存键（工作区+路径+体积+mtime）：同键回看直接复用上次渲染结果 */
  cacheKey?: string;
  /** 打开预算剩余延迟（由文件面板跨阶段计算） */
  gateDelayMs?: number;
}

/** 渲染结果 HTML 缓存（LRU 4，另有字符预算）：docx-preview 产出的 DOM 可直接复挂。 */
// 条目数 + 字符预算双重限制：docx 渲染结果内联图片/字体（base64），只按条数会失控。
const docxHtmlCache = createLruCache<string>({
  limit: 4,
  weigh: (html) => html.length,
  maxWeight: 6_000_000,
});

/**
 * DOCX 高保真预览（第三方：docx-preview，Apache-2.0，
 * https://github.com/VolodymyrBaydalka/docxjs ，懒加载）。
 * 安全审计结论（收尾 F-07/G3-M07：已审计 0.4.1 dist）：库内无 script/iframe
 * 创建、无 javascript: 字符串、无内联事件处理器（onerror 仅 FileReader 辅助），
 * DOM 经 textContent/DOM API 构造——故不需要 DOMPurify 字符串消毒链路。
 *（Xlsx 仍保留 DOMPurify，因其走 HTML 字符串拼接后 innerHTML。）
 *
 * 集成要点（docx-A）：
 * - inWrapper:false：不要库自带的灰底 wrapper + 白页阴影 chrome，只留我们一层纸面，
 *   根治"多层纸张叠在一起"与灰色蒙版；
 * - 纸面固定浅色：w:color="auto" 的正文无显式颜色、继承容器颜色，
 *   故容器固定纸面（白底黑字），亮暗主题显示一致（与 Word/Edge 行为对齐）；
 * - ignoreWidth 不开启：页面按文档真实宽度排版，浮动图形/文本框按 EMU 坐标落位，
 *   窄面板下横向滚动看全页（流式宽度会使浮动元素错位重叠）；
 * - 样式隔离见 CSS（.adl-docx-preview 不再声明排版属性，避免泄漏进文档）。
 */
export function DocxPreview({
  data,
  theme = 'dark',
  fileName,
  cacheKey,
  gateDelayMs,
}: DocxPreviewProps) {
  const { t, formatT } = useTCopy();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [rendering, setRendering] = useState(true);
  // 渲染代次：同一路径文件被外部修改时组件不卸载，靠代次丢弃上一轮迟到的结果。
  const generationRef = useRef(0);

  // 旧版格式判定与打开链路共用同一 helper（fileTypeRouter.isLegacyOfficeFile），
  // `.xls` 不在此列（SheetJS 可读 BIFF）。
  const legacy = useMemo(() => isLegacyOfficeFile(fileName), [fileName]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || legacy) {
      return undefined;
    }
    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const el: HTMLElement = container;

    // 回看命中：直接复挂上次渲染结果（零解析、零扫光）。
    const cached = cacheKey ? docxHtmlCache.get(cacheKey) : undefined;
    if (cached !== undefined) {
      el.innerHTML = cached;
      setError(null);
      setUnreadable(false);
      setRendering(false);
      return () => {
        el.innerHTML = '';
      };
    }

    el.innerHTML = '';
    setError(null);
    setUnreadable(false);
    setRendering(true);

    async function renderDocx() {
      try {
        const docx = await import('docx-preview');
        if (cancelled) {
          return;
        }
        // 不调库的情况（旧版 .doc/.dot）已在 effect 入口经 legacy 拦截，
        // 此处只处理 OOXML zip。useBase64URL：图片转 data URI，渲染结果的
        // innerHTML 才能安全缓存复用（blob URL 会在卸载时失效）。
        await docx.renderAsync(data.slice(0), el, undefined, {
          className: 'adl-docx',
          inWrapper: false,
          breakPages: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
        });
        if (!cancelled && generation === generationRef.current) {
          if (cacheKey) {
            docxHtmlCache.set(cacheKey, el.innerHTML);
          }
          setRendering(false);
        }
      } catch (err) {
        if (!cancelled && generation === generationRef.current) {
          setRendering(false);
          const message = err instanceof Error ? err.message : String(err);
          // zip 解包失败（损坏/非文档/临时文件残留）：库原文是英文技术细节，
          // 直接展示会吓到用户，映射为中文友好提示（~$ 临时文件已在渲染器层拦截）。
          if (isZipUnpackError(message)) {
            setUnreadable(true);
          } else {
            setError(message);
          }
        }
      }
    }

    void renderDocx();
    return () => {
      cancelled = true;
      el.innerHTML = '';
    };
  }, [data, legacy, cacheKey]);

  if (legacy) {
    return (
      <div
        className={`adl-docx-preview adl-docx-preview--${theme} adl-docx-preview--error`}
        role="alert"
      >
        <p>{formatT(t, 'officeLegacyFormat', { suggest: '.docx' })}</p>
      </div>
    );
  }

  if (unreadable) {
    return (
      <div
        className={`adl-docx-preview adl-docx-preview--${theme} adl-docx-preview--error`}
        role="alert"
      >
        <p>{t.docxUnreadable as string}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`adl-docx-preview adl-docx-preview--${theme} adl-docx-preview--error`}
        role="alert"
      >
        <p>{formatT(t, 'changesPreviewFailedDocx', { error: String(error) })}</p>
      </div>
    );
  }

  return (
    <div className={`adl-docx-preview adl-docx-preview--${theme}`}>
      <FidelityWatermark key={fileName} text={t.docxFidelityHint as string} fileKey={fileName} />
      <div className="adl-docx-scroll">
        {/* 容器必须保持挂载（effect 持 ref，且 docx-preview 会直接写入其 DOM），
            渲染期只临时隐藏，避免空白纸面占位跳动。 */}
        <div
          ref={containerRef}
          className="adl-docx-preview__body adl-docx-paper"
          style={rendering ? { visibility: 'hidden' } : undefined}
        />
      </div>
      {/* 扫光占位放在滚动容器之外（绝对定位铺满整个预览根），否则会被
          `.adl-docx-scroll` 的 padding 裁出一圈空白。 */}
      <PreviewLoadingGate active={rendering} delayMs={gateDelayMs} variant="paper" overlay />
    </div>
  );
}
