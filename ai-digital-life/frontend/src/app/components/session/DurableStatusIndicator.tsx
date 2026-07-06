import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

export function DurableStatusIndicator({ sessionId }: { sessionId: string }) {
  const { t } = useTCopy();
  const info = useAppStore((s) => s.durableSessions[sessionId]);

  if (!info) {
    return null;
  }

  return (
    <span className={`adl-durable-status adl-durable-status--${info.status}`} role="status">
      {t.durableSessionRunning}
    </span>
  );
}
