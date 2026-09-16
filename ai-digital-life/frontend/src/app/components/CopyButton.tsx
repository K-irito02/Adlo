import { useRef, useState } from 'react';
import { CopyIcon } from 'lucide-animated';
import type { CopyIconHandle } from 'lucide-animated';
import { TooltipSimple } from './Tooltip';
import { useTCopy } from '@i18n/useTCopy';

interface CopyButtonProps {
  /** 要复制的文本。省略时由 `onCopy` 自行完成复制（例如把图片写回系统剪贴板）。 */
  text?: string;
  size?: number;
  className?: string;
  tooltip?: string;
  tooltipCopied?: string;
  /** 复制动作。省略 `text` 时必须由它负责复制；返回 `false` 时不显示"已复制"状态。 */
  onCopy?: () => boolean | Promise<boolean> | void;
  nativeTooltip?: boolean;
}

export function CopyButton({
  text,
  size = 14,
  className,
  tooltip,
  tooltipCopied,
  onCopy,
  nativeTooltip,
}: CopyButtonProps) {
  const { t } = useTCopy();
  const [copied, setCopied] = useState(false);
  const copyIconRef = useRef<CopyIconHandle>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const content = copied
    ? (tooltipCopied ?? t.copySuccessClipboard)
    : (tooltip ?? t.fileCopyBranchName);

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (resetTimerRef.current !== undefined) {
      clearTimeout(resetTimerRef.current);
    }
    const markCopied = () => {
      copyIconRef.current?.startAnimation();
      setCopied(true);
      resetTimerRef.current = setTimeout(() => {
        copyIconRef.current?.stopAnimation();
        setCopied(false);
      }, 600);
    };

    if (text === undefined) {
      // 自定义复制路径（如图片写回系统剪贴板）：由 onCopy 完成，失败则不标记已复制。
      void Promise.resolve(onCopy?.()).then((ok) => {
        if (ok !== false) {
          markCopied();
        }
      });
      return;
    }

    navigator.clipboard?.writeText(text).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
    markCopied();
    onCopy?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick(e);
    }
  };

  const btn = (
    <span
      role="button"
      tabIndex={0}
      className={`adl-copy-btn${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={content}
      {...(nativeTooltip ? { title: content } : {})}
    >
      <CopyIcon ref={copyIconRef} size={size} />
    </span>
  );

  return nativeTooltip ? (
    btn
  ) : (
    <TooltipSimple content={content} placement="top">
      {btn}
    </TooltipSimple>
  );
}
