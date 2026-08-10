import type { PartRecord } from '../../../kernel/types-part';
import { useTCopy } from '../../i18n/useTCopy';

export function ContextToolGroup({ parts, busy }: { parts: PartRecord[]; busy?: boolean }) {
  const { t } = useTCopy();
  const tools = parts
    .map((p) => (p.data.type === 'tool' ? p.data.tool : undefined))
    .filter((x): x is string => !!x);
  return (
    <div
      className={`adl-part-context${busy ? ' adl-part-context--busy' : ''}`}
      aria-label={t.partContextGroup}
    >
      <span className="adl-part-context__label">{t.partContextGroup}</span>
      <span className="adl-part-context__tools">{tools.join(', ')}</span>
    </div>
  );
}
