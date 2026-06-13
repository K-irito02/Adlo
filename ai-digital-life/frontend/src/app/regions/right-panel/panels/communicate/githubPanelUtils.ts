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

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 0) return '刚刚';
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return formatTime(iso);
}

export function statusClass(conclusion: string | null, status: string): string {
  if (conclusion === 'success') return 'is-success';
  if (conclusion === 'failure' || conclusion === 'cancelled') return 'is-failure';
  if (conclusion === 'skipped') return 'is-skipped';
  if (status === 'in_progress' || status === 'queued') return 'is-running';
  return 'is-pending';
}
