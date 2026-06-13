import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { List, useListRef } from 'react-window';
import { useAppStore } from '../../../../stores/slicedStore';
import type { CiJobSummary } from '@ai-digital-life/kernel';
import type { DigitalLifeBridge } from '../../../../../shared/ipc';
import { AnsiUp } from 'ansi_up';
import { useTCopy } from '../../../../i18n/useTCopy';
import { TooltipSimple } from '../../../../components/Tooltip';
import { IconChevronUp, IconChevronDown, IconArrowUp, IconSearch } from '../../../../icons';

const ansiUp = new AnsiUp();
ansiUp.use_classes = true;

interface GitHubLogViewerProps {
  snapshot: { latestRun?: { htmlUrl?: string } | null; jobs: CiJobSummary[] } | null;
  config: { owner: string; repo: string; branch: string };
  dirKey: string;
  initialJobId?: number | null;
}

const ROW_HEIGHT = 20;
const MAX_BLANK_LINES = 50;

export function GitHubLogViewer({ snapshot, config, dirKey, initialJobId }: GitHubLogViewerProps) {
  const { t, formatT } = useTCopy();
  const ciAccessToken = useAppStore((s) => s.ciAccessToken);
  const cachedEntry = useAppStore((s) => s.ciLogCaches[dirKey]);
  const updateCiLogCache = useAppStore((s) => s.updateCiLogCache);

  const [selectedJobId, setSelectedJobId] = useState<number | null>(
    initialJobId ?? cachedEntry?.selectedJobId ?? null
  );
  const [cachedLogs, setCachedLogs] = useState<Record<number, string>>(cachedEntry?.logs ?? {});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const listRef = useListRef(null);

  const jobs = useMemo(() => snapshot?.jobs ?? [], [snapshot?.jobs]);

  useEffect(() => {
    if (selectedJobId === null && jobs.length > 0) {
      setSelectedJobId(jobs[0].jobId);
    }
  }, [jobs, selectedJobId]);

  const bridge = (window as unknown as { digitalLife: DigitalLifeBridge }).digitalLife;

  useEffect(() => {
    if (selectedJobId === null || !config.owner || !config.repo) {
      return;
    }
    const selectedJob = jobs.find((j) => j.jobId === selectedJobId);
    const runId = selectedJob?.runId;
    if (!runId) {
      return;
    }
    if (cachedLogs[selectedJobId]) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const fetchLogs = async () => {
      try {
        if (bridge?.github?.getJobLogs) {
          const result = await bridge.github.getJobLogs(
            {
              owner: config.owner,
              repo: config.repo,
              branch: config.branch,
              accessToken: ciAccessToken || null,
              workflowId: null,
            },
            runId
          );
          if (cancelled) {
            return;
          }
          if (result.ok) {
            setCachedLogs((prev) => ({ ...prev, ...result.data }));
          } else {
            setError(result.error?.message ?? t.ciFetchLogFailed);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [
    selectedJobId,
    config.owner,
    config.repo,
    config.branch,
    jobs,
    cachedLogs,
    bridge,
    ciAccessToken,
    t,
  ]);

  useEffect(() => {
    updateCiLogCache(dirKey, { selectedJobId, logs: cachedLogs });
  }, [dirKey, selectedJobId, cachedLogs, updateCiLogCache]);

  const currentLogText = selectedJobId !== null ? (cachedLogs[selectedJobId] ?? '') : '';

  const lines = useMemo(() => {
    if (!currentLogText) {
      return [];
    }
    return currentLogText.split('\n');
  }, [currentLogText]);

  const processedLines = useMemo(() => {
    const result: Array<{
      type: 'line' | 'blank-collapse';
      text: string;
      lineNum: number;
      blankCount?: number;
    }> = [];
    let blankRun = 0;
    const maxBlank = MAX_BLANK_LINES;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '') {
        blankRun++;
        if (collapsed && blankRun === maxBlank) {
          result.push({ type: 'blank-collapse', text: '', lineNum: i, blankCount: blankRun });
        } else if (!collapsed || blankRun < maxBlank) {
          result.push({ type: 'line', text: lines[i], lineNum: i });
        }
      } else {
        blankRun = 0;
        result.push({ type: 'line', text: lines[i], lineNum: i });
      }
    }
    return result;
  }, [lines, collapsed]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      setSearchMatchIndex(0);
      return;
    }
    const lowerQuery = searchQuery.toLowerCase();
    const matches: number[] = [];
    processedLines.forEach((item, idx) => {
      if (item.type === 'line' && item.text.toLowerCase().includes(lowerQuery)) {
        matches.push(idx);
      }
    });
    setSearchMatches(matches);
    setSearchMatchIndex(0);
    if (matches.length > 0 && listRef.current) {
      listRef.current.scrollToRow({ align: 'smart', behavior: 'auto', index: matches[0] });
    }
  }, [searchQuery, processedLines, listRef]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0) {
      return;
    }
    const newIdx = (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setSearchMatchIndex(newIdx);
    if (listRef.current) {
      listRef.current.scrollToRow({
        align: 'smart',
        behavior: 'auto',
        index: searchMatches[newIdx],
      });
    }
  }, [searchMatches, searchMatchIndex, listRef]);

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0) {
      return;
    }
    const newIdx = (searchMatchIndex + 1) % searchMatches.length;
    setSearchMatchIndex(newIdx);
    if (listRef.current) {
      listRef.current.scrollToRow({
        align: 'smart',
        behavior: 'auto',
        index: searchMatches[newIdx],
      });
    }
  }, [searchMatches, searchMatchIndex, listRef]);

  const handleSearchFocus = useCallback(() => {
    setSearchExpanded(true);
  }, []);

  const handleSearchBlur = useCallback((e: React.FocusEvent) => {
    if (!searchRef.current?.contains(e.relatedTarget as Node)) {
      setSearchExpanded(false);
    }
  }, []);

  const renderLine = useCallback((text: string) => {
    const html = ansiUp.ansi_to_html(text);
    const hasError = /\berror\b|\bfail(?:ed|ure)?\b|FAILURE/i.test(text);
    const hasWarning = /\bwarn(?:ing)?\b/i.test(text);
    let className = 'adl-logviewer__line';
    if (hasError) {
      className += ' adl-logviewer__line--error';
    } else if (hasWarning) {
      className += ' adl-logviewer__line--warning';
    }
    return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }, []);

  const Row = useCallback(
    ({
      index,
      style,
      ariaAttributes,
    }: {
      index: number;
      style: React.CSSProperties;
      ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
    }) => {
      const item = processedLines[index];
      if (!item) {
        return null;
      }

      if (item.type === 'blank-collapse') {
        return (
          <div style={{ ...style, display: 'flex', alignItems: 'center' }}>
            <span className="adl-logviewer__line-num" style={{ width: 60, flexShrink: 0 }} />
            <span className="adl-logviewer__blank-collapse" onClick={() => setCollapsed(false)}>
              {formatT(t, 'ciBlankLines', { count: item.blankCount ?? 0 })}
            </span>
          </div>
        );
      }

      const isSearchMatch = searchMatches.includes(index) && searchQuery.trim().length > 0;
      const isCurrentMatch = isSearchMatch && searchMatches[searchMatchIndex] === index;

      return (
        <div style={{ ...style, display: 'flex' }} {...ariaAttributes}>
          <span className="adl-logviewer__line-num">{item.lineNum + 1}</span>
          <span
            className={`adl-logviewer__line-content${isCurrentMatch ? ' is-current-match' : ''}${isSearchMatch ? ' is-search-match' : ''}`}
          >
            {renderLine(item.text)}
          </span>
        </div>
      );
    },
    [processedLines, searchMatches, searchMatchIndex, searchQuery, renderLine, formatT, t]
  );

  const htmlUrl = snapshot?.latestRun?.htmlUrl;

  return (
    <div className="adl-logviewer">
      <div className="adl-logviewer__toolbar">
        <div className="adl-logviewer__toolbar-left">
          <div className="adl-logviewer__job-select-wrap">
            <select
              className="adl-logviewer__job-select"
              value={selectedJobId ?? ''}
              onChange={(e) => setSelectedJobId(Number(e.target.value))}
            >
              {jobs.map((job) => (
                <option key={job.jobId} value={job.jobId}>
                  {job.name}
                </option>
              ))}
            </select>
            <span className="adl-logviewer__job-select-icon">
              <IconChevronDown width={12} height={12} />
            </span>
          </div>

          <div className="adl-logviewer__search">
            <div
              ref={searchRef}
              className={`adl-logviewer__search-wrap${searchExpanded ? ' is-expanded' : ''}`}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
            >
              <IconSearch size={14} className="adl-logviewer__search-icon" />
              <span className="adl-logviewer__search-preview">{searchQuery || t.ciSearchLog}</span>
              <input
                className="adl-logviewer__search-input"
                type="search"
                placeholder={t.ciSearchLog}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchMatches.length > 0 && (
                <>
                  <TooltipSimple content={`${t.ciPrevMatch} (Shift+Enter)`}>
                    <button
                      type="button"
                      className="adl-logviewer__toolbar-btn"
                      onClick={goToPrevMatch}
                    >
                      <IconChevronUp width={14} height={14} />
                    </button>
                  </TooltipSimple>
                  <span className="adl-logviewer__match-count">
                    {searchMatchIndex + 1}/{searchMatches.length}
                  </span>
                  <TooltipSimple content={`${t.ciNextMatch} (Enter)`}>
                    <button
                      type="button"
                      className="adl-logviewer__toolbar-btn"
                      onClick={goToNextMatch}
                    >
                      <IconChevronDown width={14} height={14} />
                    </button>
                  </TooltipSimple>
                </>
              )}
            </div>
          </div>

          <label className="adl-logviewer__toggle">
            <input type="checkbox" checked={collapsed} onChange={() => setCollapsed(!collapsed)} />
            <span className="adl-logviewer__toggle-track" />
            <span className="adl-logviewer__toggle-label">{t.ciCollapseBlank}</span>
          </label>
        </div>

        <div className="adl-logviewer__toolbar-right">
          <TooltipSimple content={`跳至顶部 (Ctrl+Home)`}>
            <button
              type="button"
              className="adl-logviewer__toolbar-btn"
              onClick={() => listRef.current?.scrollToRow?.({ index: 0 })}
            >
              <IconArrowUp width={14} height={14} />
            </button>
          </TooltipSimple>
          {htmlUrl && (
            <a
              className="adl-github__link"
              href={htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.ciViewOnGitHub}
            </a>
          )}
        </div>
      </div>

      <div className="adl-logviewer__content">
        {isLoading && (
          <div className="adl-github__empty">
            <p>{t.ciLoadingLog}</p>
          </div>
        )}
        {error && !isLoading && (
          <div className="adl-github__error">
            <span>{error}</span>
          </div>
        )}
        {!isLoading && !error && processedLines.length === 0 && (
          <div className="adl-github__empty">
            <p>{t.ciNoLogData}</p>
            {htmlUrl && (
              <a
                className="adl-github__link"
                href={htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.ciViewFullLogOnGitHub}
              </a>
            )}
          </div>
        )}
        {!isLoading && processedLines.length > 0 && (
          <List
            listRef={listRef}
            rowComponent={Row}
            rowCount={processedLines.length}
            rowHeight={ROW_HEIGHT}
            rowProps={{}}
            overscanCount={10}
          />
        )}
      </div>
    </div>
  );
}
