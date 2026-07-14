import { statusColor } from './githubPanelUtils';

export function StatusDot({
  conclusion,
  status,
  animated,
}: {
  conclusion: string | null;
  status: string;
  animated?: boolean;
}) {
  const color = statusColor(conclusion, status);
  const isRunning = animated && (status === 'in_progress' || status === 'queued');
  return (
    <span
      className={isRunning ? 'adl-status-dot adl-status-dot--animated' : 'adl-status-dot'}
      style={{ background: color }}
    />
  );
}
