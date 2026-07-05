import { useAppStore } from '../../stores/slicedStore';
import { formatT } from '../../i18n/formatT';
import { useTCopy } from '../../i18n/useTCopy';

export function CompactionIndicator() {
  const { t } = useTCopy();
  const compactionStatus = useAppStore((s) => s.compactionStatus);
  const isCompacting = useAppStore((s) => s.isCompacting);

  if (!compactionStatus || (compactionStatus.pruned_count === 0 && !compactionStatus.active)) {
    return null;
  }
  return (
    <div className="adl-compaction-indicator" role="status">
      {isCompacting
        ? t.compactionActive
        : formatT(t, 'compactionPruned', { count: compactionStatus.pruned_count })}
    </div>
  );
}
