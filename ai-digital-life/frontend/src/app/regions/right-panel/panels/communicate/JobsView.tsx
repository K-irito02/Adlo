import React, { useState, useMemo, useRef, useCallback } from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { JobRow } from './JobRow';
import { useTCopy } from '../../../../i18n/useTCopy';
import { IconSearch } from '../../../../icons';

type FilterKey = 'all' | 'success' | 'failure' | 'running';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'success', label: '成功' },
  { key: 'failure', label: '失败' },
  { key: 'running', label: '运行中' },
];

export function JobsView({
  snapshot,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  onViewLogs: (jobId: number) => void;
}) {
  const { t } = useTCopy();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearchFocus = useCallback(() => {
    setSearchExpanded(true);
  }, []);

  const handleSearchBlur = useCallback((e: React.FocusEvent) => {
    if (!searchRef.current?.contains(e.relatedTarget as Node)) {
      setSearchExpanded(false);
    }
  }, []);

  const filteredJobs = useMemo(() => {
    if (!snapshot?.jobs?.length) {
      return [];
    }
    let result = snapshot.jobs;
    switch (filter) {
      case 'success':
        result = result.filter((j) => j.conclusion === 'success');
        break;
      case 'failure':
        result = result.filter((j) => j.conclusion === 'failure' || j.conclusion === 'cancelled');
        break;
      case 'running':
        result = result.filter((j) => j.status === 'in_progress' || j.status === 'queued');
        break;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          j.stepResults.some((s) => s.name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [snapshot?.jobs, filter, searchQuery]);

  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github-empty">
        <p>{t.ciNoJobData}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="adl-github-filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`adl-github-filter__btn${filter === f.key ? ' is-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <label
          ref={searchRef}
          className={`adl-github-search--jobs${searchExpanded ? ' is-expanded' : ''}`}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
        >
          <IconSearch size={14} className="adl-github-search__icon" />
          <span className="adl-github-search__preview">{searchQuery || t.ciSearchLog}</span>
          <input
            ref={inputRef}
            className="adl-github-search__input"
            type="search"
            placeholder={t.ciSearchLog}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
      </div>
      {filteredJobs.length > 0 ? (
        <div className="adl-github-section" style={{ paddingTop: 6 }}>
          <ul className="adl-github__job-list" style={{ padding: 0 }}>
            {filteredJobs.map((job) => (
              <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="adl-github-empty" style={{ padding: '24px 16px' }}>
          <p>{t.ciNoJobData}</p>
        </div>
      )}
    </div>
  );
}
