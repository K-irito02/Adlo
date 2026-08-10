import type { PartRecord } from '../../../kernel/types-part';
import { useTCopy } from '../../i18n/useTCopy';

export function PartDiffPanel({ part }: { part: PartRecord }) {
  const { t } = useTCopy();
  const data = part.data.type === 'patch' ? part.data : undefined;
  const files = data?.files ?? [];
  return (
    <div className="adl-part-diff" aria-label={t.partDiffPanel}>
      <div className="adl-part-diff__files">
        {files.map((file) => (
          <span key={file} className="adl-part-diff__file">
            {file}
          </span>
        ))}
      </div>
    </div>
  );
}
