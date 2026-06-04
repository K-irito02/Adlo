import React, { useMemo, useState } from 'react';
import type {
  AgentRunDetail,
  DigitalLifeRunActivityEventV1,
  ModelTokenUsage,
} from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { IconChevronDown, IconChevronRight, IconClock, IconCopy } from '../../icons';
import { TokenUsage } from './TokenUsage';

interface RunSummaryBlockProps {
  t: CopyDict;
  runId: string;
  run?: AgentRunDetail;
  events: DigitalLifeRunActivityEventV1[];
  usage?: ModelTokenUsage;
  defaultExpanded?: boolean;
}

type EventGroup =
  | 'context'
  | 'files'
  | 'search'
  | 'model'
  | 'commands'
  | 'patch'
  | 'approvals'
  | 'errors'
  | 'other';

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function groupForEvent(event: DigitalLifeRunActivityEventV1): EventGroup {
  switch (event.type) {
    case 'context-added':
      return 'context';
    case 'file-read':
      return 'files';
    case 'search':
      return 'search';
    case 'model':
      return 'model';
    case 'command':
      return 'commands';
    case 'patch':
      return 'patch';
    case 'approval':
      return 'approvals';
    case 'error':
      return 'errors';
    default:
      return 'other';
  }
}

function summarizeEvent(event: DigitalLifeRunActivityEventV1): string {
  if (event.type === 'file-read') {
    return event.path;
  }
  if (event.type === 'search') {
    return event.query;
  }
  if (event.type === 'context-added') {
    return event.path ? `${event.label} (${event.path})` : event.label;
  }
  if (event.type === 'command') {
    const args = event.args?.join(' ') ?? '';
    const tail = args ? ` ${args}` : '';
    return `${event.phase}: ${event.command}${tail}`.trim();
  }
  if (event.type === 'model') {
    const model =
      event.providerId && event.modelId ? `${event.providerId}/${event.modelId}` : 'model';
    return `${event.phase}: ${model}${event.reason ? ` — ${event.reason}` : ''}`;
  }
  if (event.type === 'patch') {
    const counts =
      event.fileCount != null || event.hunkCount != null
        ? ` (${event.fileCount ?? '?'} files / ${event.hunkCount ?? '?'} hunks)`
        : '';
    return `${event.phase}: ${event.patchSetId}${counts}`;
  }
  if (event.type === 'approval') {
    const decision = event.decision ? ` · ${event.decision}` : '';
    const reason = event.reason ? ` — ${event.reason}` : '';
    return `${event.phase}: ${event.approvalId}${decision}${reason}`;
  }
  if (event.type === 'run-start') {
    return `scenario: ${event.scenario}`;
  }
  if (event.type === 'run-done') {
    return `status: ${event.status}`;
  }
  if (event.type === 'error') {
    return event.message;
  }
  return '';
}

function formatEventTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

export function RunSummaryBlock({
  t,
  runId,
  run,
  events,
  usage,
  defaultExpanded,
}: RunSummaryBlockProps) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const [filter, setFilter] = useState<EventGroup | 'all'>('all');

  const durationLabel = useMemo(() => {
    if (!run) return '—';
    const started = run.run.createdAt ?? 0;
    const done = run.run.completedAt ?? run.run.updatedAt ?? 0;
    return formatDurationMs(Math.max(0, done - started));
  }, [run]);

  const header = useMemo(() => {
    if (!run) return `${runId} · ${durationLabel}`;
    const status = run.run.status;
    const scenario = run.run.scenario;
    return `${scenario} · ${status} · ${durationLabel}`;
  }, [durationLabel, run, runId]);

  const grouped = useMemo(() => {
    const items = filter === 'all' ? events : events.filter((e) => groupForEvent(e) === filter);
    // Collapse consecutive same-type items to reduce noise (Cursor-like).
    const collapsed: DigitalLifeRunActivityEventV1[] = [];
    for (const e of items) {
      const prev = collapsed[collapsed.length - 1];
      if (prev && prev.type === e.type && summarizeEvent(prev) === summarizeEvent(e)) {
        continue;
      }
      collapsed.push(e);
    }
    const groups: Record<EventGroup, DigitalLifeRunActivityEventV1[]> = {
      context: [],
      files: [],
      search: [],
      model: [],
      commands: [],
      patch: [],
      approvals: [],
      errors: [],
      other: [],
    };
    for (const e of collapsed) {
      groups[groupForEvent(e)].push(e);
    }
    return groups;
  }, [events, filter]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ runId, run, usage, events }, null, 2));
    } catch {
      // ignore
    }
  };

  const copyEvent = async (event: DigitalLifeRunActivityEventV1) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    } catch {
      // ignore
    }
  };

  return (
    <section className="adl-run-summary" aria-label="Run summary">
      <button
        type="button"
        className="adl-run-summary__toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <IconChevronDown size={12} decorative />
        ) : (
          <IconChevronRight size={12} decorative />
        )}
        <IconClock size={12} decorative />
        <span className="adl-run-summary__title">{t.executionSummaryTitle ?? 'Run Summary'}</span>
        <span className="adl-run-summary__meta">{header}</span>
      </button>

      {expanded ? (
        <div className="adl-run-summary__body">
          {usage ? <TokenUsage t={t} usage={usage} /> : null}

          <div className="adl-run-summary__toolbar">
            <div className="adl-run-summary__filters" role="group" aria-label="Run event filters">
              {(
                [
                  'all',
                  'context',
                  'files',
                  'search',
                  'model',
                  'commands',
                  'patch',
                  'approvals',
                  'errors',
                ] as const
              ).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`adl-chip adl-chip--xs${filter === id ? ' adl-chip--info' : ' adl-chip--muted'}`}
                  onClick={() => setFilter(id)}
                >
                  {id}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="adl-chip adl-chip--xs adl-chip--muted"
              onClick={() => void handleCopy()}
            >
              <IconCopy size={12} decorative /> copy
            </button>
          </div>

          {events.length ? (
            <div className="adl-run-summary__groups">
              {(Object.keys(grouped) as EventGroup[]).map((groupId) => {
                const items = grouped[groupId];
                if (!items.length) return null;
                return (
                  <section key={groupId} className="adl-run-summary__group">
                    <header className="adl-run-summary__group-header">
                      <strong>{groupId}</strong>
                      <span className="adl-chip adl-chip--xs adl-chip--muted">{items.length}</span>
                    </header>
                    <ol className="adl-run-summary__events">
                      {items.map((event) => (
                        <li key={`${event.runId}:${event.seq}`} className="adl-run-summary__event">
                          <time className="adl-run-summary__event-time">
                            {formatEventTime(event.ts)}
                          </time>
                          <span className="adl-run-summary__event-type">{event.type}</span>
                          <span className="adl-run-summary__event-detail">
                            {summarizeEvent(event)}
                          </span>
                          <button
                            type="button"
                            className="adl-run-summary__event-copy"
                            onClick={() => void copyEvent(event)}
                            aria-label="Copy event"
                          >
                            <IconCopy size={12} decorative />
                          </button>
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          ) : (
            <p className="adl-empty-hint">{t.auditEmpty ?? '暂无可展示的活动事件。'}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
