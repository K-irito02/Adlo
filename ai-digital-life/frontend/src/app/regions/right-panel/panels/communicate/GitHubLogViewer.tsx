import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { List, useListRef } from 'react-window';
import { useAppStore } from '../../../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { CiJobSummary } from '@ai-digital-life/kernel';
import type { DigitalLifeBridge } from '../../../../../shared/ipc';
import { AnsiUp } from 'ansi_up';

const ansiUp = new AnsiUp();
ansiUp.use_classes = true;

interface GitHubLogViewerProps {
  snapshot: { latestRun?: { htmlUrl?: string } | null; jobs: CiJobSummary[] } | null;
  config: { owner: string; repo: string; branch: string };
}

const ROW_HEIGHT = 20;
const MAX_BLANK_LINES = 50;

export function GitHubLogViewer({ snapshot, config }: GitHubLogViewerProps) {
  const selectedLogJobId = useAppStore((s) => s.selectedLogJobId);
  const cachedJobLogs = useAppStore(useShallow((s) => s.cachedJobLogs));
  const logLoading = useAppStore((s) => s.logLoading);
  const logError = useAppStore((s) => s.logError);
  const { setSelectedLogJobId, setCachedJobLogs, setLogLoading, setLogError, ciAccessToken } =
    useAppStore(
      useShallow((s) => ({
        setSelectedLogJobId: s.setSelectedLogJobId,
        setCachedJobLogs: s.setCachedJobLogs,
        setLogLoading: s.setLogLoading,
        setLogError: s.setLogError,
        ciAccessToken: s.ciAccessToken,
      }))
    );

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const listRef = useListRef(null);

  const jobs = useMemo(() => snapshot?.jobs ?? [], [snapshot?.jobs]);

  useEffect(() => {
    if (selectedLogJobId === null && jobs.length > 0) {
      setSelectedLogJobId(jobs[0].jobId);
    }
  }, [jobs, selectedLogJobId, setSelectedLogJobId]);

  const bridge = (window as unknown as { digitalLife: DigitalLifeBridge }).digitalLife;

  useEffect(() => {
    if (selectedLogJobId === null || !config.owner || !config.repo) return;
    const selectedJob = jobs.find((j) => j.jobId === selectedLogJobId);
    const runId = selectedJob?.runId;
    if (!runId) return;
    if (cachedJobLogs[selectedLogJobId]) {
      setLogLoading(false);
      return;
    }
    let cancelled = false;
    setLogLoading(true);
    setLogError(null);
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
          if (cancelled) return;
          if (result.ok) {
            setCachedJobLogs(result.data);
          } else {
            setLogError(result.error?.message ?? '获取日志失败');
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLogError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLogLoading(false);
        }
      }
    };
    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [
    selectedLogJobId,
    config.owner,
    config.repo,
    config.branch,
    jobs,
    cachedJobLogs,
    setCachedJobLogs,
    setLogLoading,
    setLogError,
    bridge,
    ciAccessToken,
  ]);

  const currentLogText = selectedLogJobId !== null ? (cachedJobLogs[selectedLogJobId] ?? '') : '';

  const lines = useMemo(() => {
    if (!currentLogText) return [];
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
    if (searchMatches.length === 0) return;
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
    if (searchMatches.length === 0) return;
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

  const renderLine = useCallback((text: string) => {
    const html = ansiUp.ansi_to_html(text);
    const hasError = /\berror\b|\bfail(?:ed|ure)?\b|FAILURE/i.test(text);
    const hasWarning = /\bwarn(?:ing)?\b/i.test(text);
    let className = 'adl-logviewer__line';
    if (hasError) className += ' adl-logviewer__line--error';
    else if (hasWarning) className += ' adl-logviewer__line--warning';
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
      if (!item) return null;

      if (item.type === 'blank-collapse') {
        return (
          <div style={{ ...style, display: 'flex', alignItems: 'center' }}>
            <span className="adl-logviewer__line-num" style={{ width: 60, flexShrink: 0 }} />
            <span className="adl-logviewer__blank-collapse" onClick={() => setCollapsed(false)}>
              [{item.blankCount ?? 0} 行空白 — 点击展开]
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
    [processedLines, searchMatches, searchMatchIndex, searchQuery, renderLine]
  );

  const htmlUrl = snapshot?.latestRun?.htmlUrl;

  return (
    <div className="adl-logviewer">
      <div className="adl-logviewer__toolbar">
        <div className="adl-logviewer__toolbar-left">
          <select
            className="adl-logviewer__job-select"
            value={selectedLogJobId ?? ''}
            onChange={(e) => setSelectedLogJobId(Number(e.target.value))}
          >
            {jobs.map((job) => (
              <option key={job.jobId} value={job.jobId}>
                {job.name}
              </option>
            ))}
          </select>

          <div className="adl-logviewer__search">
            <input
              className="adl-logviewer__search-input"
              type="text"
              placeholder="搜索日志…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchMatches.length > 0 && (
              <>
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--xs"
                  onClick={goToPrevMatch}
                  title="上一个匹配"
                >
                  ▲
                </button>
                <span className="adl-logviewer__match-count">
                  {searchMatchIndex + 1}/{searchMatches.length}
                </span>
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--xs"
                  onClick={goToNextMatch}
                  title="下一个匹配"
                >
                  ▼
                </button>
              </>
            )}
          </div>

          <label className="adl-logviewer__toggle-label">
            <input type="checkbox" checked={collapsed} onChange={() => setCollapsed(!collapsed)} />
            <span>折叠空白</span>
          </label>
        </div>

        <div className="adl-logviewer__toolbar-right">
          {htmlUrl && (
            <a
              className="adl-github__link"
              href={htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              在 GitHub 查看
            </a>
          )}
        </div>
      </div>

      <div className="adl-logviewer__content">
        {logLoading && (
          <div className="adl-github__empty">
            <p>加载日志中…</p>
          </div>
        )}
        {logError && !logLoading && (
          <div className="adl-github__error">
            <span>{logError}</span>
          </div>
        )}
        {!logLoading && !logError && processedLines.length === 0 && (
          <div className="adl-github__empty">
            <p>暂无日志数据</p>
            {htmlUrl && (
              <a
                className="adl-github__link"
                href={htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                在 GitHub 查看完整日志
              </a>
            )}
          </div>
        )}
        {!logLoading && processedLines.length > 0 && (
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
