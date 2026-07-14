import { useEffect, useRef } from 'react';
import { useTCopy } from '@i18n/useTCopy';

interface FileCreationBarProps {
  createTarget: 'file' | 'folder';
  createPathValue: string;
  createInputRef: React.RefObject<HTMLInputElement | null>;
  isValidPath: (value: string) => boolean;
  onPathChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}

function FileCreationBar({
  createTarget,
  createPathValue,
  createInputRef,
  isValidPath,
  onPathChange,
  onSubmit,
  onCancel,
}: FileCreationBarProps) {
  const { t } = useTCopy();
  const prevTargetRef = useRef<'file' | 'folder' | null>(null);

  useEffect(() => {
    if (prevTargetRef.current !== createTarget) {
      prevTargetRef.current = createTarget;
      const timer = window.setTimeout(() => {
        createInputRef.current?.focus();
        createInputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [createTarget, createInputRef]);

  const isFile = createTarget === 'file';

  return (
    <div className="adl-tool-navigator__createbar">
      <input
        ref={createInputRef}
        type="text"
        className="adl-tool-navigator__createinput"
        value={createPathValue}
        onChange={(event) => onPathChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onSubmit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        aria-label={(isFile ? t.fileNewFile : t.fileNewFolder) as string}
      />
      <button
        type="button"
        className="adl-btn adl-btn--ghost adl-btn--sm"
        onClick={() => void onSubmit()}
        disabled={!isValidPath(createPathValue)}
      >
        {(isFile ? t.fileNewFile : t.fileNewFolder) as string}
      </button>
      <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onCancel}>
        {t.cancel as string}
      </button>
    </div>
  );
}

export { FileCreationBar };
export type { FileCreationBarProps };
