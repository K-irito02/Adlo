import { useTCopy } from '../../i18n/useTCopy';

export interface SessionFileTabItem {
  url: string;
  filename?: string;
}

export function SessionFileTabs({
  files,
  onSelect,
}: {
  files: SessionFileTabItem[];
  onSelect?: (url: string) => void;
}) {
  const { t } = useTCopy();
  if (files.length === 0) {
    return null;
  }
  return (
    <div className="adl-part-file-tabs" role="tablist" aria-label={t.partSessionFileTabs}>
      {files.map((file) => (
        <button
          key={file.url}
          type="button"
          role="tab"
          className="adl-part-file-tab"
          onClick={() => onSelect?.(file.url)}
        >
          <span className="adl-part-file-tab__name">{file.filename ?? file.url}</span>
        </button>
      ))}
    </div>
  );
}
