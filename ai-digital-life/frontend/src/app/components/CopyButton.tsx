import { useRef, useState } from 'react';
import { CopyIcon } from 'lucide-animated';
import type { CopyIconHandle } from 'lucide-animated';
import { TooltipSimple } from './Tooltip';
import { useTCopy } from '@i18n/useTCopy';

interface CopyButtonProps {
  text: string;
  size?: number;
  className?: string;
  tooltip?: string;
  tooltipCopied?: string;
  onCopy?: () => void;
}

export function CopyButton({
  text,
  size = 14,
  className,
  tooltip,
  tooltipCopied,
  onCopy,
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
    navigator.clipboard?.writeText(text).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
    copyIconRef.current?.startAnimation();
    setCopied(true);
    onCopy?.();
    if (resetTimerRef.current !== undefined) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      copyIconRef.current?.stopAnimation();
      setCopied(false);
    }, 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick(e);
    }
  };

  return (
    <TooltipSimple content={content} placement="top">
      <span
        role="button"
        tabIndex={0}
        className={`adl-copy-btn${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={content}
      >
        <CopyIcon ref={copyIconRef} size={size} />
      </span>
    </TooltipSimple>
  );
}
