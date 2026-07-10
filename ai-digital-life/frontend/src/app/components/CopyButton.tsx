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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(text).catch(() => {});
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

  return (
    <TooltipSimple content={content} placement="top">
      <button
        type="button"
        className={`adl-copy-btn${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
        onClick={handleClick}
        aria-label={content}
      >
        <CopyIcon ref={copyIconRef} size={size} />
      </button>
    </TooltipSimple>
  );
}
