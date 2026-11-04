import { IconArrowLeft, IconArrowRight } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';

interface FileHistoryNavProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

function FileHistoryNav({ canGoBack, canGoForward, onBack, onForward }: FileHistoryNavProps) {
  const { t } = useTCopy();
  return (
    <>
      <TooltipSimple content={t.browserBack as string} placement="top">
        <button
          type="button"
          className="adl-tool-context__iconbtn"
          onClick={onBack}
          aria-label={t.browserBack as string}
          disabled={!canGoBack}
        >
          <IconArrowLeft size={14} decorative />
        </button>
      </TooltipSimple>
      <TooltipSimple content={t.browserForward as string} placement="top">
        <button
          type="button"
          className="adl-tool-context__iconbtn"
          onClick={onForward}
          aria-label={t.browserForward as string}
          disabled={!canGoForward}
        >
          <IconArrowRight size={14} decorative />
        </button>
      </TooltipSimple>
    </>
  );
}

export { FileHistoryNav };
