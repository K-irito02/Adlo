import { useEffect, useRef, useState } from 'react';
import { CopyIcon } from 'lucide-animated';
import type { CopyIconHandle } from 'lucide-animated';
import { TooltipSimple } from './Tooltip';
import type { Placement } from '@utils/tooltipPosition';
import { useTCopy } from '@i18n/useTCopy';

interface CopyButtonProps {
  /** 要复制的文本。省略时由 `onCopy` 自行完成复制（例如把图片写回系统剪贴板）。 */
  text?: string;
  size?: number;
  className?: string;
  tooltip?: string;
  tooltipCopied?: string;
  /** Tooltip 出现方位（默认 `'top'`，保持既有调用处行为不变）。 */
  tooltipPlacement?: Placement;
  /**
   * 复制动作。省略 `text`（自定义复制路径）时必须由它负责复制；
   * 该路径下返回 `false` 时不显示"已复制"状态（有 `text` 时返回值被忽略）。
   */
  onCopy?: () => boolean | Promise<boolean> | void;
  nativeTooltip?: boolean;
}

function writeTextFallback(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export function CopyButton({
  text,
  size = 14,
  className,
  tooltip,
  tooltipCopied,
  onCopy,
  nativeTooltip,
  tooltipPlacement = 'top',
}: CopyButtonProps) {
  const { t } = useTCopy();
  const [copied, setCopied] = useState(false);
  const copyIconRef = useRef<CopyIconHandle>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (resetTimerRef.current !== undefined) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const content = copied
    ? (tooltipCopied ?? t.copySuccessClipboard)
    : (tooltip ?? t.fileCopyBranchName);

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (resetTimerRef.current !== undefined) {
      clearTimeout(resetTimerRef.current);
    }
    const markCopied = () => {
      if (!mountedRef.current) {
        return;
      }
      copyIconRef.current?.startAnimation();
      setCopied(true);
      resetTimerRef.current = setTimeout(() => {
        copyIconRef.current?.stopAnimation();
        setCopied(false);
      }, 600);
    };

    if (text === undefined) {
      if (!onCopy) {
        return;
      }
      // 自定义复制路径（如图片写回系统剪贴板）：由 onCopy 完成，失败则不标记已复制。
      // `onCopy` 在 then 内调用，确保其同步抛错也走 catch 分支。
      void Promise.resolve()
        .then(() => onCopy())
        .then((ok) => {
          if (ok !== false) {
            markCopied();
          }
        })
        .catch(() => {
          // onCopy 侧的失败提示由其自行负责；此处仅避免未捕获 rejection 与虚假"已复制"。
        });
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => writeTextFallback(text));
    } else {
      writeTextFallback(text);
    }
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
    <TooltipSimple content={content} placement={tooltipPlacement}>
      {btn}
    </TooltipSimple>
  );
}
