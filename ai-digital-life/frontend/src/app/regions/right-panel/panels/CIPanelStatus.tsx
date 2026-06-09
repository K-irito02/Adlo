/**
 * CI 面板 - 状态展示区
 */
import React, { useState } from 'react';
import { workspaceSelectors } from '../../../stores/selectors';
import { getAppCopy } from '../../../i18n';
import type { CiJobSummary, CiRepoConfig, CiStatusSnapshot } from '@ai-digital-life/kernel';

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const secs = Math.round((e - s) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return `${mins}m ${rem}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function statusColor(conclusion: string | null, status: string): string {
  if (conclusion === 'success') return 'var(--success)';
  if (conclusion === 'failure' || conclusion === 'cancelled') return 'var(--danger)';
  if (conclusion === 'skipped') return 'var(--text-tertiary)';
  if (status === 'in_progress' || status === 'queued') return 'var(--warning)';
  return 'var(--text-secondary)';
}

function StatusDot({ conclusion, status }: { conclusion: string | null; status: string }) {
  const color = statusColor(conclusion, status);
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function formatCommit(sha: string): string {
  return sha ? sha.slice(0, 7) : '—';
}

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
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

interface CIPanelStatusProps {
  config: CiRepoConfig;
  accessToken: string;
  loading: boolean;
  error: string | null;
  snapshot: CiStatusSnapshot | null;
  onConfigChange: (owner: string, repo: string, branch: string, token: string) => void;
  onClearToken: () => void;
}

function JobRow({ job }: { job: CiJobSummary }) {
  const [expanded, setExpanded] = useState(false);
  const color = statusColor(job.conclusion, job.status);

  return (
    <li className="adl-ci__job">
      <div
        className="adl-ci__job-header"
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <StatusDot conclusion={job.conclusion} status={job.status} />
        <span className="adl-ci__job-name">{job.name}</span>
        <span className="adl-chip adl-chip--xs" style={{ color, borderColor: color }}>
          {job.conclusion ?? job.status}
        </span>
        <span className="adl-ci__job-duration adl-text--secondary">
          {formatDuration(job.startedAt, job.completedAt)}
        </span>
        <span className="adl-ci__job-toggle">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && job.stepResults.length > 0 && (
        <ul className="adl-ci__steps">
          {job.stepResults.map((step, i) => (
            <li key={i} className="adl-ci__step">
              <StatusDot conclusion={step.conclusion} status={step.status} />
              <span>{step.name}</span>
              <span
                style={{
                  color: statusColor(step.conclusion, step.status),
                  fontSize: 'var(--text-xs)',
                  marginLeft: 'auto',
                }}
              >
                {step.conclusion ?? step.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function CIPanelStatus({
  config,
  accessToken,
  loading,
  error,
  snapshot,
  onConfigChange,
  onClearToken,
}: CIPanelStatusProps) {
  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);
  const [ownerInput, setOwnerInput] = useState(config.owner);
  const [repoInput, setRepoInput] = useState(config.repo);
  const [branchInput, setBranchInput] = useState(config.branch);
  const [tokenInput, setTokenInput] = useState(accessToken);
  const [tokenVisible, setTokenVisible] = useState(false);

  // Update local inputs when config changes externally
  React.useEffect(() => {
    setOwnerInput(config.owner);
    setRepoInput(config.repo);
    setBranchInput(config.branch);
  }, [config.owner, config.repo, config.branch]);

  React.useEffect(() => {
    setTokenInput(accessToken);
  }, [accessToken]);

  const handleApply = () => {
    onConfigChange(
      ownerInput.trim(),
      repoInput.trim(),
      branchInput.trim() || 'main',
      tokenInput.trim()
    );
  };

  return (
    <div className="adl-ci__status">
      {/* Config Area */}
      <div className="adl-ci__config">
        <div className="adl-ci__config-row">
          <input
            className="adl-input adl-input--sm"
            placeholder={copy.ciOwnerPlaceholder}
            value={ownerInput}
            onChange={(e) => setOwnerInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          />
          <span className="adl-ci__config-sep">/</span>
          <input
            className="adl-input adl-input--sm"
            placeholder={copy.ciRepoPlaceholder}
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          />
        </div>
        <div className="adl-ci__config-row">
          <input
            className="adl-input adl-input--sm"
            placeholder={copy.ciBranchPlaceholder}
            value={branchInput}
            onChange={(e) => setBranchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          />
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--sm"
            onClick={handleApply}
            disabled={!ownerInput.trim() || !repoInput.trim()}
          >
            {copy.ciQueryButton}
          </button>
        </div>
        <div className="adl-ci__config-row">
          <input
            className="adl-input adl-input--sm"
            placeholder={copy.ciTokenPlaceholder}
            type={tokenVisible ? 'text' : 'password'}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          />
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--sm"
            onClick={() => setTokenVisible((v) => !v)}
            title={tokenVisible ? '隐藏' : '显示'}
          >
            {tokenVisible ? '👁' : '👁‍🗨'}
          </button>
          {accessToken && (
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={onClearToken}
              title="清除 Token"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                <path
                  fillRule="evenodd"
                  d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
                />
              </svg>
            </button>
          )}
        </div>
        <div className="adl-ci__token-hint adl-text--xs adl-text--secondary">
          Token 仅保存在浏览器本地，不会上传至服务器
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="adl-ci__error">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Body */}
      {snapshot && !error && (
        <div className="adl-ci__body">
          {snapshot.latestRun ? (
            <>
              <div className="adl-ci__run-summary">
                <div className="adl-ci__run-title">
                  <StatusDot
                    conclusion={snapshot.latestRun.conclusion}
                    status={snapshot.latestRun.status}
                  />
                  <span className="adl-ci__run-name">{snapshot.latestRun.name}</span>
                  <span
                    className="adl-chip adl-chip--xs"
                    style={{
                      color: statusColor(snapshot.latestRun.conclusion, snapshot.latestRun.status),
                    }}
                  >
                    {snapshot.latestRun.conclusion ?? snapshot.latestRun.status}
                  </span>
                </div>
                <div className="adl-ci__run-meta">
                  <span>
                    <span className="adl-text--tertiary">{copy.ciTriggeredBy}:</span>{' '}
                    {snapshot.latestRun.actor ?? '—'}
                  </span>
                  <span>
                    <span className="adl-text--tertiary">{copy.ciEvent}:</span>{' '}
                    {snapshot.latestRun.event ?? '—'}
                  </span>
                  <span>
                    <span className="adl-text--tertiary">{copy.ciSha}:</span>
                    <code className="adl-ci__sha">{formatCommit(snapshot.latestRun.headSha)}</code>
                  </span>
                  <span>
                    <span className="adl-text--tertiary">{copy.ciStartedAt}:</span>{' '}
                    {formatTime(snapshot.latestRun.runStartedAt)}
                  </span>
                  {snapshot.latestRun.htmlUrl && (
                    <a
                      className="adl-ci__link"
                      href={snapshot.latestRun.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {copy.ciViewOnGithub}
                    </a>
                  )}
                </div>
              </div>

              {snapshot.jobs.length > 0 && (
                <div className="adl-ci__jobs">
                  <h4 className="adl-ci__section-title">
                    {copy.ciJobsTitle} ({snapshot.jobs.length})
                  </h4>
                  <ul className="adl-ci__job-list">
                    {snapshot.jobs.map((job) => (
                      <JobRow key={job.jobId} job={job} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="adl-ci__empty">
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <p>{copy.ciNoWorkflowRuns}</p>
              <span className="adl-text--tertiary">
                {copy.ciNoWorkflowRunsHint.replace('{branch}', config.branch)}
              </span>
            </div>
          )}
        </div>
      )}

      {!snapshot && !error && !loading && (
        <div className="adl-ci__empty">
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          </svg>
          <p>{copy.ciConfigToQuery}</p>
          <span className="adl-text--tertiary">{copy.ciConfigToQueryHint}</span>
        </div>
      )}

      <style>{`
        .adl-ci__status {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .adl-ci__config {
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .adl-ci__config-row {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .adl-ci__config-row .adl-input {
          flex: 1;
          min-width: 0;
        }
        .adl-ci__config-sep {
          color: var(--text-tertiary);
          font-size: var(--text-sm);
        }
        .adl-ci__token-hint {
          margin-top: 2px;
          padding: 0 2px;
          opacity: 0.8;
        }
        .adl-ci__error {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: var(--surface-danger);
          color: var(--danger);
          font-size: var(--text-xs);
          border-radius: 4px;
          margin: 8px 12px;
          flex-shrink: 0;
        }
        .adl-ci__body {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }
        .adl-ci__run-summary {
          padding: 0 12px 8px;
          border-bottom: 1px solid var(--border);
        }
        .adl-ci__run-title {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
        }
        .adl-ci__run-name {
          font-size: var(--text-sm);
          font-weight: 500;
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .adl-ci__run-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 12px;
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .adl-ci__run-meta span {
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .adl-ci__sha {
          font-family: monospace;
          font-size: var(--text-xs);
          background: var(--surface-secondary);
          padding: 1px 4px;
          border-radius: 3px;
        }
        .adl-ci__link {
          color: var(--link);
          font-size: var(--text-xs);
          text-decoration: none;
        }
        .adl-ci__link:hover {
          text-decoration: underline;
        }
        .adl-ci__jobs {
          padding: 8px 12px 0;
        }
        .adl-ci__section-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 6px;
        }
        .adl-ci__job-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .adl-ci__job {
          border-radius: 4px;
          overflow: hidden;
        }
        .adl-ci__job-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          border-radius: 4px;
          background: var(--surface-secondary);
          font-size: var(--text-xs);
        }
        .adl-ci__job-header:hover {
          background: var(--surface-hover);
        }
        .adl-ci__job-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .adl-ci__job-duration {
          font-size: var(--text-xs);
          flex-shrink: 0;
        }
        .adl-ci__job-toggle {
          color: var(--text-tertiary);
          font-size: 8px;
          flex-shrink: 0;
        }
        .adl-ci__steps {
          list-style: none;
          margin: 2px 0 0 20px;
          padding: 4px 0;
          border-left: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .adl-ci__step {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .adl-ci__empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 32px 16px;
          color: var(--text-tertiary);
          text-align: center;
        }
        .adl-ci__empty p {
          margin: 0;
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }
        .adl-ci__empty span {
          font-size: var(--text-xs);
        }
      `}</style>
    </div>
  );
}
