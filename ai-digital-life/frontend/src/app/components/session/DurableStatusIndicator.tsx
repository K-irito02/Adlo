import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

export function DurableStatusIndicator({ sessionId }: { sessionId: string }) {
  const { t } = useTCopy();
  const info = useAppStore((s) => s.durableSessions[sessionId]);

  if (!info) {
    return null;
  }

  const statusLabels: Record<string, string> = {
    running: t.durableSessionRunning,
    completed: t.durableSessionCompleted,
    failed: t.durableSessionFailed,
    crashed: t.durableSessionCrashed,
  };

  return (
    <span className={`adl-durable-status adl-durable-status--${info.status}`} role="status">
      {statusLabels[info.status] ?? t.durableSessionRunning}
    </span>
  );
}
