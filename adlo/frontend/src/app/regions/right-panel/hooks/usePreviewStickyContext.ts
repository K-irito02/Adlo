import { useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  createStickyContextModel,
  SMOOTH_SCROLL_MAX_VIEWPORTS,
  type StickyContextModel,
} from '../editor-support/stickyContext';

/**
 * 预览面（Markdown / PDF / Office / 媒体）的“文件顶部”模型。
 *
 * 预览的滚动容器可能在 surface 内部（Markdown 是内层 `.adl-markdown-preview`，
 * docx/xlsx/pdf 各自有内层滚动区）。当前实现在 surface 上用捕获监听收集真实
 * `event.target`，用最后一次滚动元素作为回顶目标；按钮的可见性只看该元素的 `scrollTop`。
 */
export function usePreviewStickyContext(
  containerRef: React.RefObject<HTMLDivElement | null>,
  resetKey: string,
): StickyContextModel | null {
  const { t } = useTCopy();
  const [model, setModel] = useState<StickyContextModel | null>(null);
  const seqRef = useRef(0);
  const revealSeqRef = useRef(0);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const topLabel = t.stickyContextTop as string;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setModel(null);
      return;
    }

    scrollerRef.current = null;
    seqRef.current = 0;
    revealSeqRef.current = 0;
    setModel(null);

    const update = (target: EventTarget | null, source: 'scroll' | 'layout') => {
      const scroller = target instanceof HTMLElement ? target : container;
      scrollerRef.current = scroller;
      seqRef.current += 1;
      if (source === 'scroll') {
        revealSeqRef.current += 1;
      }
      setModel(
        createStickyContextModel({
          modelId: `${resetKey}:${seqRef.current}`,
          canScrollToTop: scroller.scrollTop > 0,
          revealSignal: revealSeqRef.current,
          onNavigateLine: () => undefined,
          scrollToTop: () => {
            const active = scrollerRef.current;
            if (!active) {
              return;
            }
            const smooth = active.scrollTop <= active.clientHeight * SMOOTH_SCROLL_MAX_VIEWPORTS;
            if (smooth) {
              active.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              active.scrollTop = 0;
            }
          },
          topLabel,
        }),
      );
    };

    update(container, 'layout');
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target === container || container.contains(target))) {
        update(target, 'scroll');
      }
    };
    // 捕获阶段才能收到内层滚动容器的 scroll（scroll 不冒泡）。
    container.addEventListener('scroll', handleScroll, true);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => update(scrollerRef.current, 'layout'))
        : null;
    observer?.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll, true);
      observer?.disconnect();
    };
  }, [containerRef, resetKey, topLabel]);

  return model;
}
