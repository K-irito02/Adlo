import { useTCopy } from '../../i18n/useTCopy';

export function TurnSummary({
  status,
}: {
  status: 'idle' | 'busy' | 'error' | 'cancelled' | 'completed';
}) {
  const { t } = useTCopy();
  const label =
    status === 'completed'
      ? t.partTurnCompleted
      : status === 'error'
        ? t.partTurnError
        : status === 'cancelled'
          ? t.partTurnCancelled
          : t.partTurnRunning;
  return (
    <div className={`adl-part-turn-summary adl-part-turn-summary--${status}`} role="status">
      <span>{label}</span>
    </div>
  );
}
