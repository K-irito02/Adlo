/**
 * GitHub 面板 — 继承原 CIPanelStatus 逻辑，重构为
 * nav-button + navigator-content + primary 三栏布局
 */
import React, { useState, useEffect } from 'react';
import type { CiJobSummary, CiStatusSnapshot } from '@ai-digital-life/kernel';
import { useCIPanelProps } from '../../hooks/useCIPanelProps';
import { useAppStore } from '../../../../stores/slicedStore';
import { workspaceSelectors } from '../../../../stores/selectors';
import { getAppCopy } from '../../../../i18n';
import type { GitHubSection } from '../../../../stores/slices/communicateSlice';
import { GitHubLogViewer } from './GitHubLogViewer';

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

function JobRow({ job, onViewLogs }: { job: CiJobSummary; onViewLogs: (jobId: number) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="adl-github__job">
      <div
        className="adl-github__job-header"
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <StatusDot conclusion={job.conclusion} status={job.status} />
        <span className="adl-github__job-name">{job.name}</span>
        <span
          className="adl-chip adl-chip--xs"
          style={{
            color: statusColor(job.conclusion, job.status),
            borderColor: statusColor(job.conclusion, job.status),
          }}
        >
          {job.conclusion ?? job.status}
        </span>
        <span className="adl-github__job-duration adl-text--secondary">
          {formatDuration(job.startedAt, job.completedAt)}
        </span>
        <button
          type="button"
          className="adl-github__log-btn"
          onClick={(e) => {
            e.stopPropagation();
            onViewLogs(job.jobId);
          }}
          title="查看日志"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm1 3h10v1H3V4zm0 3h10v1H3V7zm0 3h7v1H3v-1z" />
          </svg>
        </button>
        <span className="adl-github__job-toggle">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && job.stepResults.length > 0 && (
        <ul className="adl-github__steps">
          {job.stepResults.map((step, i) => (
            <li key={i} className="adl-github__step">
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

function OverviewView({
  snapshot,
  loading,
  branch,
  copy,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  loading: boolean;
  branch: string;
  copy: Record<string, string>;
  onViewLogs: (jobId: number) => void;
}) {
  if (loading && !snapshot) {
    return (
      <div className="adl-github__empty">
        <p>{'加载中…'}</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="adl-github__empty">
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
    );
  }

  return (
    <div>
      {snapshot.latestRun ? (
        <>
          <div className="adl-github__run-summary">
            <div className="adl-github__run-title">
              <StatusDot
                conclusion={snapshot.latestRun.conclusion}
                status={snapshot.latestRun.status}
              />
              <span className="adl-github__run-name">{snapshot.latestRun.name}</span>
              <span
                className="adl-chip adl-chip--xs"
                style={{
                  color: statusColor(snapshot.latestRun.conclusion, snapshot.latestRun.status),
                }}
              >
                {snapshot.latestRun.conclusion ?? snapshot.latestRun.status}
              </span>
            </div>
            <div className="adl-github__run-meta">
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
                <code className="adl-github__sha">{formatCommit(snapshot.latestRun.headSha)}</code>
              </span>
              <span>
                <span className="adl-text--tertiary">{copy.ciStartedAt}:</span>{' '}
                {formatTime(snapshot.latestRun.runStartedAt)}
              </span>
              {snapshot.latestRun.htmlUrl && (
                <a
                  className="adl-github__link"
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
            <div className="adl-github__jobs">
              <h4 className="adl-github__section-title">
                {copy.ciJobsTitle} ({snapshot.jobs.length})
              </h4>
              <ul className="adl-github__job-list">
                {snapshot.jobs.map((job) => (
                  <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="adl-github__empty">
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
            {copy.ciNoWorkflowRunsHint.replace('{branch}', branch)}
          </span>
        </div>
      )}
    </div>
  );
}

function WorkflowsView({ snapshot }: { snapshot: CiStatusSnapshot | null }) {
  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github__empty">
        <p>暂无 Workflow 数据</p>
      </div>
    );
  }

  return (
    <div className="adl-github__jobs" style={{ padding: '8px 12px 0' }}>
      {snapshot.jobs.map((job) => (
        <div key={job.jobId} style={{ marginBottom: 8 }}>
          <h4 className="adl-github__section-title" style={{ marginBottom: 4 }}>
            <StatusDot conclusion={job.conclusion} status={job.status} />
            <span style={{ marginLeft: 6 }}>{job.name}</span>
          </h4>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              paddingLeft: 14,
            }}
          >
            {job.stepResults.length} 个 Step
          </div>
        </div>
      ))}
    </div>
  );
}

function JobsView({
  snapshot,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  onViewLogs: (jobId: number) => void;
}) {
  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github__empty">
        <p>暂无 Job 数据</p>
      </div>
    );
  }

  return (
    <div className="adl-github__jobs" style={{ padding: '8px 12px 0' }}>
      <h4 className="adl-github__section-title" style={{ marginBottom: 6 }}>
        {snapshot.jobs.length} 个 Job
      </h4>
      <ul className="adl-github__job-list">
        {snapshot.jobs.map((job) => (
          <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
        ))}
      </ul>
    </div>
  );
}

function SettingsView({
  accessToken,
  error,
  ownerInput,
  repoInput,
  branchInput,
  tokenInput,
  tokenVisible,
  copy,
  onOwnerChange,
  onRepoChange,
  onBranchChange,
  onTokenChange,
  onToggleToken,
  onApply,
  onClearToken,
}: {
  accessToken: string;
  error: string | null;
  ownerInput: string;
  repoInput: string;
  branchInput: string;
  tokenInput: string;
  tokenVisible: boolean;
  copy: Record<string, string>;
  onOwnerChange: (v: string) => void;
  onRepoChange: (v: string) => void;
  onBranchChange: (v: string) => void;
  onTokenChange: (v: string) => void;
  onToggleToken: () => void;
  onApply: () => void;
  onClearToken: () => void;
}) {
  return (
    <div>
      <div className="adl-github__config">
        <div className="adl-github__config-row">
          <input
            className="adl-input adl-input--sm"
            placeholder={copy.ciOwnerPlaceholder}
            value={ownerInput}
            onChange={(e) => onOwnerChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApply()}
          />
          <span className="adl-github__config-sep">/</span>
          <input
            className="adl-input adl-input--sm"
            placeholder={copy.ciRepoPlaceholder}
            value={repoInput}
            onChange={(e) => onRepoChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApply()}
          />
        </div>
        <div className="adl-github__config-row">
          <input
            className="adl-input adl-input--sm"
            placeholder={copy.ciBranchPlaceholder}
            value={branchInput}
            onChange={(e) => onBranchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApply()}
          />
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--sm"
            onClick={onApply}
            disabled={!ownerInput.trim() || !repoInput.trim()}
          >
            {copy.ciQueryButton}
          </button>
        </div>
        <div className="adl-github__config-row">
          <input
            className="adl-input adl-input--sm"
            placeholder={copy.ciTokenPlaceholder}
            type={tokenVisible ? 'text' : 'password'}
            value={tokenInput}
            onChange={(e) => onTokenChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApply()}
          />
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--sm"
            onClick={onToggleToken}
            title={tokenVisible ? '隐藏' : '显示'}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              {tokenVisible ? (
                <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.75 1.034-1.246 1.571C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
              ) : (
                <>
                  <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.75 1.034-1.246 1.571-.389.422-.816.812-1.27 1.145l.242.234z" />
                  <path d="M3.588 4.243A7.025 7.025 0 0 0 1.172 6.66 13.133 13.133 0 0 0 0 8s3 5.5 8 5.5c2.024 0 3.743-.685 5.022-1.714l.707.707a.5.5 0 1 0 .707-.707l-12-12a.5.5 0 1 0-.707.707l1.86 1.86zM2.063 9.675A12.3 12.3 0 0 0 1.172 8a13.134 13.134 0 0 1 2.298-2.649l.735.735A6.68 6.68 0 0 0 2.99 9.782c.33.475.744.98 1.258 1.444C5.332 12.332 7.12 13.5 9 13.5c1.15 0 2.187-.353 3.06-.942l.656.656a6.535 6.535 0 0 1-1.582.938c-.337.135-.664.243-.97.318l.737.737a.5.5 0 1 1-.707.707l-12-12a.5.5 0 1 1 .707-.707l2.152 2.152z" />
                </>
              )}
            </svg>
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
        <div className="adl-github__token-hint adl-text--xs adl-text--secondary">
          Token 仅保存在浏览器本地，不会上传至服务器
        </div>
      </div>

      {error && (
        <div className="adl-github__error">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function HelpView({ copy }: { copy: Record<string, string> }) {
  return (
    <div style={{ padding: 12 }}>
      <section style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            paddingBottom: 4,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {copy.ciHelpBasicTitle}
        </h3>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpHowToConfig}
          </h4>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {copy.ciHelpHowToConfigContent}
          </p>
        </div>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpStatusColors}
          </h4>
          <pre
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {copy.ciHelpStatusColorsContent}
          </pre>
        </div>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpViewLogs}
          </h4>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {copy.ciHelpViewLogsContent}
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            paddingBottom: 4,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {copy.ciHelpConceptsTitle}
        </h3>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            marginTop: 8,
            lineHeight: 1.6,
          }}
        >
          <p>
            <strong>Workflow：</strong>
            {copy.ciHelpConceptWorkflowDef}
          </p>
          <p>
            <strong>Job：</strong>
            {copy.ciHelpConceptJobDef}
          </p>
          <p>
            <strong>Step：</strong>
            {copy.ciHelpConceptStepDef}
          </p>
          <p>
            <strong>Run：</strong>
            {copy.ciHelpConceptRunDef}
          </p>
        </div>
      </section>

      <section>
        <h3
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            paddingBottom: 4,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {copy.ciHelpTokenTitle}
        </h3>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpTokenWhyNeed}
          </h4>
          <pre
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {copy.ciHelpTokenWhyNeedContent}
          </pre>
        </div>
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 8,
          }}
        >
          <h4
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {copy.ciHelpTokenSecurity}
          </h4>
          <pre
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {copy.ciHelpTokenSecurityContent}
          </pre>
        </div>
      </section>
    </div>
  );
}

function getNavItems(section: GitHubSection, snapshot: CiStatusSnapshot | null): string[] {
  switch (section) {
    case 'overview':
      return snapshot?.jobs?.length
        ? ['最近运行', ...snapshot.jobs.slice(0, 5).map((j) => j.name)]
        : ['暂无数据'];
    case 'workflows':
      return snapshot?.jobs?.length ? snapshot.jobs.map((j) => j.name) : ['暂无 Workflow'];
    case 'jobs':
      return snapshot?.jobs?.length ? snapshot.jobs.map((j) => j.name) : ['暂无 Job'];
    case 'logs':
      return snapshot?.jobs?.length ? snapshot.jobs.map((j) => j.name) : ['暂无日志'];
    case 'settings':
      return ['仓库配置', 'Token 管理'];
    case 'help':
      return ['基础使用', '进阶概念', 'Token 配置'];
    default:
      return [];
  }
}

export function GitHubPanel() {
  const { config, accessToken, loading, error, snapshot, onConfigChange, onClearToken } =
    useCIPanelProps();

  const activeGitHubSection = useAppStore(
    (s: { activeGitHubSection: GitHubSection }) => s.activeGitHubSection
  );
  const setActiveGitHubSection = useAppStore(
    (s: { setActiveGitHubSection: (section: GitHubSection) => void }) => s.setActiveGitHubSection
  );
  const setSelectedLogJobId = useAppStore(
    (s: { setSelectedLogJobId: (id: number | null) => void }) => s.setSelectedLogJobId
  );

  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

  const [ownerInput, setOwnerInput] = useState(config.owner);
  const [repoInput, setRepoInput] = useState(config.repo);
  const [branchInput, setBranchInput] = useState(config.branch);
  const [tokenInput, setTokenInput] = useState(accessToken);
  const [tokenVisible, setTokenVisible] = useState(false);

  useEffect(() => {
    setOwnerInput(config.owner);
    setRepoInput(config.repo);
    setBranchInput(config.branch);
  }, [config.owner, config.repo, config.branch]);

  useEffect(() => {
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

  const handleViewLogs = (jobId: number) => {
    setSelectedLogJobId(jobId);
    setActiveGitHubSection('logs');
  };

  const sections: Array<{ id: GitHubSection; label: string; icon: React.ReactNode }> = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M2 2h5v5H2V2zm0 7h5v5H2V9zm7-7h5v5H9V2zm0 7h5v5H9V9z" />
        </svg>
      ),
    },
    {
      id: 'workflows',
      label: 'Workflows',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M8 1a.5.5 0 0 1 .5.5v6h6a.5.5 0 0 1 0 1h-6v6a.5.5 0 0 1-1 0v-6h-6a.5.5 0 0 1 0-1h6v-6A.5.5 0 0 1 8 1z" />
        </svg>
      ),
    },
    {
      id: 'jobs',
      label: 'Jobs',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7zM3.5 4a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-9z" />
          <path d="M4.5 6.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z" />
        </svg>
      ),
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm1 3h10v1H3V4zm0 3h10v1H3V7zm0 3h7v1H3v-1z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
          <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
        </svg>
      ),
    },
    {
      id: 'help',
      label: 'Help',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-.5v2h.5a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5v-2.5a.5.5 0 0 1 .5-.5zm1 5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z" />
        </svg>
      ),
    },
  ];

  const navItems = getNavItems(activeGitHubSection, snapshot);

  const renderPrimary = () => {
    switch (activeGitHubSection) {
      case 'overview':
        return (
          <OverviewView
            snapshot={snapshot}
            loading={loading}
            branch={config.branch}
            copy={copy}
            onViewLogs={handleViewLogs}
          />
        );
      case 'workflows':
        return <WorkflowsView snapshot={snapshot} />;
      case 'jobs':
        return <JobsView snapshot={snapshot} onViewLogs={handleViewLogs} />;
      case 'settings':
        return (
          <SettingsView
            accessToken={accessToken}
            error={error}
            ownerInput={ownerInput}
            repoInput={repoInput}
            branchInput={branchInput}
            tokenInput={tokenInput}
            tokenVisible={tokenVisible}
            copy={copy}
            onOwnerChange={setOwnerInput}
            onRepoChange={setRepoInput}
            onBranchChange={setBranchInput}
            onTokenChange={setTokenInput}
            onToggleToken={() => setTokenVisible((v) => !v)}
            onApply={handleApply}
            onClearToken={onClearToken}
          />
        );
      case 'help':
        return <HelpView copy={copy} />;
      case 'logs':
        return <GitHubLogViewer snapshot={snapshot} config={config} />;
    }
  };

  return (
    <div className="adl-communicate__surface">
      <div className="adl-communicate__navigator">
        <div className="adl-communicate__nav-buttons">
          {sections.map((sec) => (
            <button
              key={sec.id}
              type="button"
              className={`adl-communicate__nav-btn${activeGitHubSection === sec.id ? ' is-active' : ''}`}
              onClick={() => setActiveGitHubSection(sec.id)}
            >
              <span>{sec.icon}</span>
              <span>{sec.label}</span>
            </button>
          ))}
        </div>

        <div className="adl-communicate__nav-content">
          <div className="adl-github__nav-list">
            {navItems.map((item, i) => (
              <div key={i} className="adl-github__nav-item">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="adl-communicate__primary">
        <div className="adl-communicate__primary-scroll">{renderPrimary()}</div>
      </div>
    </div>
  );
}
