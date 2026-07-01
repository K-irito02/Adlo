import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { List, useListRef } from 'react-window';
import { useAppStore } from '@stores/slicedStore';
import type { CiJobSummary } from '@ai-digital-life/kernel';
import { AnsiUp } from 'ansi_up';
import { useTCopy } from '@app/i18n/useTCopy';
import { TooltipSimple } from '@components/Tooltip';
import { IconChevronUp, IconChevronDown, IconArrowUp, IconSearch, IconCheck } from '@app/icons';
import { useFloatingMenu } from '@app/hooks/useFloatingMenu';
import { useLogViewerJobs } from './useLogViewerJobs';
import { useLogSearch } from './useLogSearch';

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

  const jobs = useMemo(() => snapshot?.jobs ?? [], [snapshot?.jobs]);

  const { selectedJobId, cachedLogs, isLoading, error, setSelectedJobId } = useLogViewerJobs({
    jobs,
    config,
    dirKey,
    initialJobId,
    cachedEntry,
    updateCiLogCache,
    ciAccessToken,
    t,
  });

  const {
    open: dropdownOpen,
    left: menuLeft,
    top: menuTop,
    width: menuWidth,
    setOpen: setDropdownOpen,
    setPosition: setMenuPosition,
  } = useFloatingMenu();

  const [collapsed, setCollapsed] = useState(true);
  const listRef = useListRef(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

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

  const {
    searchQuery,
    searchMatchIndex,
    searchMatches,
    setSearchQuery,
    goToPrevMatch,
    goToNextMatch,
  } = useLogSearch({ processedLines, listRef });

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

  const selectedJob = selectedJobId !== null ? jobs.find((j) => j.jobId === selectedJobId) : null;

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = toolbarRef.current?.querySelector('.adl-logviewer__job-select-menu');
      if (triggerRef.current?.contains(target) || menuEl?.contains(target)) {
        return;
      }
      setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen, setDropdownOpen]);

  const htmlUrl = snapshot?.latestRun?.htmlUrl;

  return (
    <div className="adl-logviewer">
      <div className="adl-logviewer__toolbar" ref={toolbarRef}>
        <div className="adl-logviewer__toolbar-left">
          <div className="adl-logviewer__job-select-wrap">
            <button
              ref={triggerRef}
              type="button"
              className="adl-logviewer__job-select-trigger"
              onClick={() => {
                if (!dropdownOpen && triggerRef.current && toolbarRef.current) {
                  const r = triggerRef.current.getBoundingClientRect();
                  const tr = toolbarRef.current.getBoundingClientRect();
                  setMenuPosition(r.left - tr.left, r.bottom - tr.top, r.width);
                }
                setDropdownOpen((v) => !v);
              }}
            >
              <span className="adl-logviewer__job-select-text">
                {selectedJob?.name ?? t.ciSelectJob}
              </span>
              <span className="adl-logviewer__job-select-chevron">
                <IconChevronDown width={12} height={12} />
              </span>
            </button>
          </div>

          <div className="adl-logviewer__search">
            <div className="adl-logviewer__search-wrap">
              <IconSearch size={14} className="adl-logviewer__search-icon" />
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

          <label className="adl-logviewer__checkbox">
            <input type="checkbox" checked={collapsed} onChange={() => setCollapsed(!collapsed)} />
            <span className="adl-logviewer__checkbox-box">
              {collapsed && <IconCheck width={10} height={10} />}
            </span>
            <span className="adl-logviewer__checkbox-label">{t.ciCollapseBlank}</span>
          </label>
        </div>

        <div className="adl-logviewer__toolbar-right">
          <TooltipSimple content={t.ciJumpToTop}>
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
        {dropdownOpen && (
          <div
            className="adl-logviewer__job-select-menu"
            style={{ left: menuLeft, top: menuTop, width: menuWidth }}
          >
            {jobs.map((job) => (
              <div
                key={job.jobId}
                className="adl-logviewer__job-select-item"
                onClick={() => {
                  setSelectedJobId(job.jobId);
                  setDropdownOpen(false);
                }}
                title={job.name}
              >
                <span className="adl-logviewer__job-select-item-name">{job.name}</span>
                <span className="adl-logviewer__job-select-check">
                  {selectedJobId === job.jobId && <IconCheck width={12} height={12} />}
                </span>
              </div>
            ))}
          </div>
        )}
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
