import { useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { FidelityWatermark } from './FidelityWatermark';
import { isZipUnpackError } from './officeErrors';

export interface DocxPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
  /** 工作区相对路径：用于识别旧版 .doc 二进制格式并给出转存指引 */
  fileName?: string;
}

/**
 * DOCX 高保真预览（第三方：docx-preview，Apache-2.0，
 * https://github.com/VolodymyrBaydalka/docxjs ，懒加载）。
 * renderAsync 直接构造 DOM 节点（文本经 textContent 写入，无 HTML 字符串拼接），
 * 因此不需要 DOMPurify 字符串消毒链路。
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
export function DocxPreview({ data, theme = 'dark', fileName }: DocxPreviewProps) {
  const { t, formatT } = useTCopy();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  // 旧版 .doc/.dot 是 OLE 二进制格式（与 PptxPreview 的 legacy 同式，用 memo 同步派生，
  // 不单独 effect，避免首轮渲染读到 stale 值）。
  const legacy = useMemo(() => {
    const lowerName = (fileName ?? '').toLowerCase();
    return lowerName.endsWith('.doc') || lowerName.endsWith('.dot');
  }, [fileName]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || legacy) {
      return undefined;
    }
    let cancelled = false;
    const el: HTMLElement = container;
    el.innerHTML = '';
    setError(null);
    setUnreadable(false);

    async function renderDocx() {
      try {
        const docx = await import('docx-preview');
        if (cancelled) {
          return;
        }
        // 不调库的情况（旧版 .doc/.dot）已在 effect 入口经 legacy 拦截，
        // 此处只处理 OOXML zip。
        await docx.renderAsync(data.slice(0), el, undefined, {
          className: 'adl-docx',
          inWrapper: false,
          breakPages: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      } catch (err) {
        if (!cancelled) {
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
  }, [data, legacy]);

  if (legacy) {
    return (
      <div className={`adl-docx-preview adl-docx-preview--${theme} adl-docx-preview--error`}>
        <p>{formatT(t, 'officeLegacyFormat', { suggest: '.docx' })}</p>
      </div>
    );
  }

  if (unreadable) {
    return (
      <div className={`adl-docx-preview adl-docx-preview--${theme} adl-docx-preview--error`}>
        <p>{t.docxUnreadable as string}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`adl-docx-preview adl-docx-preview--${theme} adl-docx-preview--error`}>
        <p>{formatT(t, 'changesPreviewFailedDocx', { error: String(error) })}</p>
      </div>
    );
  }

  return (
    <div className={`adl-docx-preview adl-docx-preview--${theme}`}>
      <FidelityWatermark key={fileName} text={t.docxFidelityHint as string} fileKey={fileName} />
      <div className="adl-docx-scroll">
        <div ref={containerRef} className="adl-docx-preview__body adl-docx-paper" />
      </div>
    </div>
  );
}
