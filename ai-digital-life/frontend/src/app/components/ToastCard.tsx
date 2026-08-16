import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useTCopy, copyToClipboard } from '../i18n';
import { renderIcon, type IconName } from '../../design-system/icons';

export type ToastTone = 'error' | 'warning' | 'info';

interface ToastCardProps {
  tone: ToastTone;
  icon: IconName;
  title?: React.ReactNode;
  /** 标题下方的正文（错误详情/补充提示），可折叠、可复制 */
  detail?: string;
  /** 提供后渲染关闭按钮，点击时回调 */
  onDismiss?: () => void;
  className?: string;
  role?: 'alert' | 'status';
  ariaLive?: 'assertive' | 'polite';
}

function iconHtml(name: IconName, size: 'sm' | 'md' = 'md'): string {
  return renderIcon(name, { size, decorative: true }).value;
}

/**
 * 可复用的右下角提示卡片外壳。
 * 完整复用全局错误卡片（ErrorToast）的视觉与交互规范：
 * 圆形图标 + 简短标题/可折叠详情 + 折叠/复制/关闭按钮 + 不自动消失。
 * 通过 tone 控制主题色，供文件操作警告等场景复用。
 */
export const ToastCard = forwardRef<HTMLDivElement, ToastCardProps>(function ToastCard(
  { tone, icon, title, detail, onDismiss, className, role = 'alert', ariaLive = 'assertive' },
  ref,
) {
  const { t } = useTCopy();
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [collapsedSettled, setCollapsedSettled] = useState(false);
  const [detailHeight, setDetailHeight] = useState<number | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const detailRef = useRef<HTMLParagraphElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (detail == null) {
      return;
    }
    const result = await copyToClipboard(detail);
    if (result.ok) {
      setCopied(true);
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const hasDetail = detail != null && detail.length > 0;

  const collapsed = !expanded;

  const toggleExpanded = () => {
    setExpanded((v) => !v);
    setCollapsedSettled(false);
  };

  const handleDetailTransitionEnd = (e: React.TransitionEvent<HTMLParagraphElement>) => {
    if (e.target !== detailRef.current) {
      return;
    }
    if (!expanded && e.propertyName === 'max-height') {
      setCollapsedSettled(true);
    }
  };

  const measureDetail = useCallback(() => {
    const el = detailRef.current;
    if (!el) {
      return;
    }
    setDetailHeight(el.scrollHeight);
  }, []);

  useLayoutEffect(() => {
    if (collapsedSettled) {
      return;
    }
    measureDetail();
  }, [detail, hasDetail, expanded, collapsedSettled, measureDetail]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (!collapsedSettled) {
        measureDetail();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [detail, hasDetail, collapsedSettled, measureDetail]);

  return (
    <motion.div
      ref={ref}
      className={`toast-card toast-card--${tone}${className ? ` ${className}` : ''}`}
      role={role}
      aria-live={ariaLive}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <span className="toast-card__icon" dangerouslySetInnerHTML={{ __html: iconHtml(icon) }} />
      <div ref={bodyRef} className="toast-card__body">
        {title ? <p className="toast-card__title">{title}</p> : null}
        {hasDetail ? (
          <p
            ref={detailRef}
            className={`toast-card__detail${collapsed && collapsedSettled ? ' is-collapsed-settled' : ''}`}
            style={{
              maxHeight: expanded
                ? detailHeight != null
                  ? `${detailHeight}px`
                  : 'none'
                : 'calc(var(--text-xs) * var(--leading-normal))',
            }}
            onTransitionEnd={handleDetailTransitionEnd}
          >
            {detail}
          </p>
        ) : null}
      </div>
      <div className="toast-card__actions">
        {hasDetail ? (
          <button
            type="button"
            className="toast-card__btn toast-card__btn--detail"
            aria-label={expanded ? t.errorsCollapse : t.errorsExpand}
            onClick={toggleExpanded}
            dangerouslySetInnerHTML={{
              __html: iconHtml(expanded ? 'chevron-down' : 'chevron-up', 'sm'),
            }}
          />
        ) : null}
        {hasDetail ? (
          <button
            type="button"
            className="toast-card__btn toast-card__btn--detail"
            aria-label={copied ? t.errorsCopied : t.errorsCopy}
            onClick={() => void handleCopy()}
            dangerouslySetInnerHTML={{
              __html: iconHtml(copied ? 'check' : 'copy', 'sm'),
            }}
          />
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            className="toast-card__btn"
            aria-label={t.errorsClose}
            onClick={onDismiss}
            dangerouslySetInnerHTML={{ __html: iconHtml('close', 'sm') }}
          />
        ) : null}
      </div>
    </motion.div>
  );
});
