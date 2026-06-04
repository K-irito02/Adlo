import React, { useMemo, useState } from 'react';
import type { AuditEntry, RiskLevel } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { IconClock, IconFilter } from '../../icons';

interface AuditPanelProps {
  t: CopyDict;
  entries: AuditEntry[];
}

type AuditFilter = 'all' | AuditEntry['operationType'];

const FILTER_OPTIONS: Array<{ value: AuditFilter; labelKey: keyof CopyDict }> = [
  { value: 'all', labelKey: 'auditFilterAll' },
  { value: 'command', labelKey: 'auditFilterCommand' },
  { value: 'file-write', labelKey: 'auditFilterFile' },
  { value: 'file-delete', labelKey: 'auditFilterFile' },
  { value: 'patch-apply', labelKey: 'auditFilterPatch' },
  { value: 'patch-rollback', labelKey: 'auditFilterPatch' },
  { value: 'approval', labelKey: 'auditFilterApproval' },
];

const UNIQUE_FILTERS: Array<{ value: AuditFilter; labelKey: keyof CopyDict }> = [
  { value: 'all', labelKey: 'auditFilterAll' },
  { value: 'command', labelKey: 'auditFilterCommand' },
  { value: 'file-write', labelKey: 'auditFilterFile' },
  { value: 'patch-apply', labelKey: 'auditFilterPatch' },
  { value: 'approval', labelKey: 'auditFilterApproval' },
];

function riskDotClass(level: RiskLevel): string {
  switch (level) {
    case 'high':
      return 'adl-audit-timeline__dot--high';
    case 'medium':
      return 'adl-audit-timeline__dot--medium';
    default:
      return 'adl-audit-timeline__dot--low';
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AuditPanel({ t, entries }: AuditPanelProps) {
  const [filter, setFilter] = useState<AuditFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => {
      if (filter === 'file-write')
        return e.operationType === 'file-write' || e.operationType === 'file-delete';
      if (filter === 'patch-apply')
        return e.operationType === 'patch-apply' || e.operationType === 'patch-rollback';
      return e.operationType === filter;
    });
  }, [entries, filter]);

  return (
    <div className="adl-audit-panel">
      <header className="adl-audit-panel__header">
        <IconClock size={16} decorative />
        <h3>{t.auditTitle}</h3>
      </header>

      <div className="adl-audit-panel__filters">
        <IconFilter size={12} decorative />
        {UNIQUE_FILTERS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`adl-chip adl-chip--xs${filter === opt.value ? ' adl-chip--info' : ' adl-chip--muted'}`}
            onClick={() => setFilter(opt.value)}
          >
            {t[opt.labelKey] as string}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="adl-empty-hint">{t.auditEmpty}</p>
      ) : (
        <ol className="adl-audit-timeline">
          {filtered.map((entry) => (
            <li key={entry.id} className="adl-audit-timeline__entry">
              <span
                className={`adl-audit-timeline__dot ${riskDotClass(entry.riskLevel)}`}
                aria-hidden="true"
              />
              <div className="adl-audit-timeline__content">
                <div className="adl-audit-timeline__row">
                  <time>{formatTime(entry.timestamp)}</time>
                  <span className="adl-chip adl-chip--xs adl-chip--muted">
                    {entry.operationType}
                  </span>
                  {entry.decision && (
                    <span
                      className={`adl-chip adl-chip--xs ${entry.decision === 'approved' ? 'adl-chip--success' : entry.decision === 'rejected' ? 'adl-chip--danger' : 'adl-chip--muted'}`}
                    >
                      {entry.decision}
                    </span>
                  )}
                </div>
                <p>{entry.summary}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
