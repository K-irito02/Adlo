export function formatDuration(start?: string | null, end?: string | null): string {
  if (!start) {
    return '—';
  }
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const secs = Math.round((e - s) / 1000);
  if (secs < 60) {
    return `${secs}s`;
  }
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) {
    return `${mins}m ${rem}s`;
  }
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function statusColor(conclusion: string | null, status: string): string {
  if (conclusion === 'success') {
    return 'var(--success)';
  }
  if (conclusion === 'failure' || conclusion === 'cancelled') {
    return 'var(--danger)';
  }
  if (conclusion === 'skipped') {
    return 'var(--text-tertiary)';
  }
  if (status === 'in_progress' || status === 'queued') {
    return 'var(--warning)';
  }
  return 'var(--text-secondary)';
}

export function formatCommit(sha: string): string {
  return sha ? sha.slice(0, 7) : '—';
}

export function formatTime(iso?: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
