import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CiJobSummary, CiStatusSnapshot } from '@ai-digital-life/kernel';
import {
  IconFoldVertical,
  IconUnfoldVertical,
  IconRefreshCw,
  IconTrash,
  IconClose,
  IconFiles,
  IconList,
  IconFolderPlus,
} from '../../../../icons';
import { TooltipSimple } from '../../../../components/Tooltip';
import { useAppStore } from '../../../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useCIPanelProps } from '../../hooks/useCIPanelProps';
import { workspaceSelectors } from '../../../../stores/selectors';
import { getAppCopy } from '../../../../i18n';
import { GitHubTree } from '../../../../features/github-tree/GitHubTree';
import type { SectionCallbacks } from '../../../../features/github-tree/GitHubCategorySection';
import { GitHubLogViewer } from './GitHubLogViewer';

// MenuHintItem 组件 - 带提示子卡片的菜单项
interface MenuHintItemProps {
  label: string;
  hint: string;
  onClick: () => void;
}

function MenuHintItem({ label, hint, onClick }: MenuHintItemProps) {
  const hintRef = useRef<HTMLSpanElement>(null);
  const subCardsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    return () => {
      subCardsRef.current.forEach(el => el.remove());
      subCardsRef.current = [];
    };
  }, []);

  return (
    <button
      type="button"
      className="adl-multitree-entry__menu-item"
      role="menuitem"
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        ref={hintRef}
        className="adl-menu-item__hint"
        onMouseEnter={(e) => {
          e.stopPropagation();
          const button = (e.target as HTMLElement).closest('button');
          const originalTitle = button?.getAttribute('title');
          if (originalTitle) {
            button?.setAttribute('data-original-title', originalTitle);
            button?.removeAttribute('title');
          }

          const buttonEl = (e.target as HTMLElement).closest('button');
          const buttonRect = buttonEl?.getBoundingClientRect();
          const menuCard = document.querySelector('[data-menu-id="github-delete-all-menu"]');
          if (buttonRect && menuCard) {
            const menuRect = menuCard.getBoundingClientRect();
            const centerY = buttonRect.top + buttonRect.height / 2;

            const card = document.createElement('div');
            card.className = 'adl-sub-hint-card';
            card.textContent = hint;
            card.style.left = `${menuRect.right + 1}px`;
            card.style.top = `${centerY}px`;
            card.style.transform = 'translateY(-50%)';

            const arrow = document.createElement('div');
            arrow.className = 'adl-sub-hint-card__arrow';
            arrow.style.left = `${menuRect.right - 4}px`;
            arrow.style.top = `${centerY - 4}px`;

            const arrowBorder = document.createElement('div');
            arrowBorder.className = 'adl-sub-hint-card__arrow-border';
            arrowBorder.style.left = `${menuRect.right - 5}px`;
            arrowBorder.style.top = `${centerY - 5}px`;

            document.body.appendChild(card);
            document.body.appendChild(arrow);
            document.body.appendChild(arrowBorder);

            subCardsRef.current = [card, arrow, arrowBorder];
          }
        }}
        onMouseLeave={(e) => {
          e.stopPropagation();
          subCardsRef.current.forEach(el => el.remove());
          subCardsRef.current = [];
          const button = (e.target as HTMLElement).closest('button');
          const originalTitle = button?.getAttribute('data-original-title');
          if (originalTitle) {
            button?.setAttribute('title', originalTitle);
            button?.removeAttribute('data-original-title');
          }
        }}
      >
        !
      </span>
    </button>
  );
}

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

function GitHubSettingsDialog({
  open,
  workspaceName,
  initialOwner,
  initialRepo,
  initialBranch,
  error,
  copy,
  onSave,
  onCancel,
}: {
  open: boolean;
  workspaceName: string;
  initialOwner: string;
  initialRepo: string;
  initialBranch: string;
  error: string | null;
  copy: Record<string, string>;
  onSave: (owner: string, repo: string, branch: string, token: string) => void;
  onCancel: () => void;
}) {
  const [owner, setOwner] = useState(initialOwner);
  const [repo, setRepo] = useState(initialRepo);
  const [branch, setBranch] = useState(initialBranch);
  const [token, setToken] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);

  const prevInitialOwnerRef = useRef(initialOwner);
  if (initialOwner !== prevInitialOwnerRef.current) {
    prevInitialOwnerRef.current = initialOwner;
    setOwner(initialOwner);
    setRepo(initialRepo);
    setBranch(initialBranch);
    setToken('');
  }

  if (!open) return null;

  return createPortal(
    <div className="adl-dialog-overlay" onClick={onCancel}>
      <div className="adl-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-dialog__header">
          <h3 className="adl-dialog__title">配置 CI - {workspaceName}</h3>
          <button type="button" className="adl-dialog__close" onClick={onCancel}>
            <IconClose size={14} decorative />
          </button>
        </div>
        <div className="adl-dialog__body">
          <div className="adl-github__config">
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciOwnerPlaceholder}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(owner, repo, branch, token)}
              />
              <span className="adl-github__config-sep">/</span>
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciRepoPlaceholder}
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(owner, repo, branch, token)}
              />
            </div>
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciBranchPlaceholder}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(owner, repo, branch, token)}
              />
            </div>
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciTokenPlaceholder}
                type={tokenVisible ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(owner, repo, branch, token)}
              />
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--sm"
                onClick={() => setTokenVisible((v) => !v)}
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
            </div>
            <div className="adl-github__token-hint adl-text--xs adl-text--secondary">
              Token 仅保存在浏览器本地，不会上传至服务器
            </div>
          </div>
          {error && (
            <div className="adl-github__error">
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="adl-dialog__footer">
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--sm"
            onClick={() => onSave(owner, repo, branch, token)}
            disabled={!owner.trim() || !repo.trim()}
          >
            保存并查询
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function GitHubPanel() {
  const {
    gitHubWorkspaceConfigs,
    loading,
    error: ciError,
    onSaveWorkspaceConfig,
    onRemoveWorkspaceConfig,
    onRefreshWorkspace,
  } = useCIPanelProps();

  const {
    gitHubTreeExpanded,
    gitHubAllTreeExpanded,
    selectedGitHubTreePath,
    activeCiWorkspaceId,
    activeWorkspaceSection,
    communicateNavigatorCollapsed,
  } = useAppStore(
    useShallow((s) => ({
      gitHubTreeExpanded: s.gitHubTreeExpanded,
      gitHubAllTreeExpanded: s.gitHubAllTreeExpanded,
      selectedGitHubTreePath: s.selectedGitHubTreePath,
      activeCiWorkspaceId: s.activeCiWorkspaceId,
      activeWorkspaceSection: s.activeWorkspaceSection,
      communicateNavigatorCollapsed: s.communicateNavigatorCollapsed,
    }))
  );
  const workspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const ciSnapshot = useAppStore(useShallow((s) => s.ciSnapshot));

  const {
    toggleGitHubTreePath,
    expandAllGitHubTree,
    collapseAllGitHubTree,
    setSelectedGitHubTreePath,
    setActiveCiWorkspaceId,
    setActiveWorkspaceSection,
    clearAllGitHubWorkspaceConfigs,
    setSelectedLogJobId,
    gitHubCiFolders,
    gitHubCreateFolder,
    gitHubSaveFolderConfig,
    clearCiState,
    clearAllFolders,
    clearAllCiConfigs,
    clearAllCiConfigsAndData,
    resetAllToOriginal,
  } = useAppStore(
    useShallow((s) => ({
      toggleGitHubTreePath: s.toggleGitHubTreePath,
      expandAllGitHubTree: s.expandAllGitHubTree,
      collapseAllGitHubTree: s.collapseAllGitHubTree,
      setSelectedGitHubTreePath: s.setSelectedGitHubTreePath,
      setActiveCiWorkspaceId: s.setActiveCiWorkspaceId,
      setActiveWorkspaceSection: s.setActiveWorkspaceSection,
      clearAllGitHubWorkspaceConfigs: s.clearAllGitHubWorkspaceConfigs,
      setSelectedLogJobId: s.setSelectedLogJobId,
      gitHubCiFolders: s.gitHubCiFolders,
      gitHubCreateFolder: s.gitHubCreateFolder,
      gitHubSaveFolderConfig: s.gitHubSaveFolderConfig,
      clearCiState: s.clearCiState,
      clearAllFolders: s.clearAllFolders,
      clearAllCiConfigs: s.clearAllCiConfigs,
      clearAllCiConfigsAndData: s.clearAllCiConfigsAndData,
      resetAllToOriginal: s.resetAllToOriginal,
    }))
  );

  const selectedTreePathRef = useRef<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [gitHubViewMode, setGitHubViewMode] = useState<'tree' | 'list'>('tree');
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
  const [settingsFolderId, setSettingsFolderId] = useState<string | null>(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [deleteMenuHovering, setDeleteMenuHovering] = useState(false);
  const deleteMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteTooltipOpen, setDeleteTooltipOpen] = useState(false);

  // 清理定时器
  const clearDeleteMenuTimer = useCallback(() => {
    if (deleteMenuTimerRef.current) {
      clearTimeout(deleteMenuTimerRef.current);
      deleteMenuTimerRef.current = null;
    }
  }, []);

  // 检查鼠标是否在相关元素上
  const isMouseOverDeleteUI = useCallback(() => {
    const button = deleteButtonRef.current;
    const menu = document.querySelector('[data-menu-id="github-delete-all-menu"]');
    const tooltip = document.querySelector('[data-tooltip-id="github-delete-tooltip"]');

    return (
      (button && button.matches(':hover')) ||
      (menu && (menu as HTMLElement).matches(':hover')) ||
      (tooltip && (tooltip as HTMLElement).matches(':hover'))
    );
  }, []);

  const handleSelectTreePath = useCallback(
    (path: string | null) => {
      selectedTreePathRef.current = path ?? null;
      setSelectedGitHubTreePath(path);
      setShowHelp(false);
      if (path?.startsWith('github-workspace:')) {
        const parts = path.split(':');
        const wsId = parts[1];
        if (wsId) {
          setActiveCiWorkspaceId(wsId);
        }
      }
    },
    [setSelectedGitHubTreePath, setActiveCiWorkspaceId]
  );

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedEntry = target.closest('.adl-browser-entry');
      const clickedFileTreeRow = target.closest('.adl-filetree__row');

      if (clickedEntry) {
        if (clickedFileTreeRow) {
          const row = clickedFileTreeRow as HTMLElement;
          const nodePath = row.dataset.path;
          if (nodePath) {
            handleSelectTreePath(nodePath);
            return;
          }
        }
        return;
      }

      handleSelectTreePath(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [handleSelectTreePath]);

  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

  const activeConfig = activeCiWorkspaceId ? gitHubWorkspaceConfigs[activeCiWorkspaceId] : null;
  const visibleWorkspaces = workspaces;

  const handleTogglePath = useCallback(
    (path: string) => {
      toggleGitHubTreePath(path);
    },
    [toggleGitHubTreePath]
  );

  const handleCreateFolder = useCallback(() => {
    const path = selectedTreePathRef.current;
    if (path?.startsWith('github-folder:')) {
      const folderId = path.slice('github-folder:'.length);
      gitHubCreateFolder(folderId, 'folder');
    } else if (path?.startsWith('github-workspace:')) {
      const wsId = path.slice('github-workspace:'.length);
      gitHubCreateFolder(wsId, 'workspace');
    } else {
      gitHubCreateFolder(undefined, undefined);
    }
  }, [gitHubCreateFolder]);

  const handleViewLogs = useCallback(
    (jobId: number) => {
      setSelectedLogJobId(jobId);
      setActiveWorkspaceSection('logs');
    },
    [setSelectedLogJobId, setActiveWorkspaceSection]
  );

  const handleClearAll = useCallback(() => {
    if (window.confirm('确定删除所有工作区的 CI 配置及数据？')) {
      clearAllGitHubWorkspaceConfigs();
    }
  }, [clearAllGitHubWorkspaceConfigs]);

  const handleRefreshAll = useCallback(() => {
    for (const wsId of Object.keys(gitHubWorkspaceConfigs)) {
      if (gitHubWorkspaceConfigs[wsId].configured) {
        onRefreshWorkspace(wsId);
      }
    }
  }, [gitHubWorkspaceConfigs, onRefreshWorkspace]);

  const sectionCallbacks: SectionCallbacks = useMemo(
    () => ({
      onSelectWorkspace: (workspaceId) => {
        setSelectedGitHubTreePath(`github-workspace:${workspaceId}`);
        setActiveCiWorkspaceId(workspaceId);
        setActiveWorkspaceSection('overview');
        setShowHelp(false);
      },
      onSelectSection: (workspaceId, section) => {
        setSelectedGitHubTreePath(`github-workspace:${workspaceId}:${section}`);
        setActiveCiWorkspaceId(workspaceId);
        setActiveWorkspaceSection(section);
        setShowHelp(false);
      },
      onDeleteWorkspaceConfig: (workspaceId) => {
        onRemoveWorkspaceConfig(workspaceId);
      },
      onOpenSettings: (workspaceId) => {
        setSettingsWorkspaceId(workspaceId);
        setSettingsFolderId(null);
      },
      onOpenFolderSettings: (folderId) => {
        setSettingsFolderId(folderId);
        setSettingsWorkspaceId(null);
      },
      onRefreshWorkspace: (workspaceId) => {
        onRefreshWorkspace(workspaceId);
        setActiveCiWorkspaceId(workspaceId);
      },
      onDeleteFolderConfig: (folderId) => {
        // This is handled via the store action at the tree entry level;
        // we expose it here if needed via callbacks.
      },
      onClearCiState: () => {
        clearCiState();
      },
    }),
    [
      setSelectedGitHubTreePath,
      setActiveCiWorkspaceId,
      setActiveWorkspaceSection,
      onRemoveWorkspaceConfig,
      onRefreshWorkspace,
      clearCiState,
    ]
  );

  const settingsConfig = settingsWorkspaceId
    ? gitHubWorkspaceConfigs[settingsWorkspaceId]
    : settingsFolderId
      ? gitHubCiFolders.find((f) => f.id === settingsFolderId)?.ciConfig
      : null;
  const settingsInitialOwner = settingsConfig?.owner ?? '';
  const settingsInitialRepo = settingsConfig?.repo ?? '';
  const settingsInitialBranch = settingsConfig?.branch ?? 'main';
  const settingsName = settingsWorkspaceId
    ? workspaces.find((w) => w.id === settingsWorkspaceId)?.name ?? settingsWorkspaceId
    : settingsFolderId
      ? gitHubCiFolders.find((f) => f.id === settingsFolderId)?.name ?? settingsFolderId
      : '';

  const handleSettingsSave = useCallback(
    (owner: string, repo: string, branch: string, token: string) => {
      if (settingsWorkspaceId) {
        onSaveWorkspaceConfig(settingsWorkspaceId, owner, repo, branch, token);
        setSettingsWorkspaceId(null);
      } else if (settingsFolderId) {
        gitHubSaveFolderConfig(settingsFolderId, owner, repo, branch, token);
        setSettingsFolderId(null);
      }
    },
    [settingsWorkspaceId, settingsFolderId, onSaveWorkspaceConfig, gitHubSaveFolderConfig]
  );

  const handleSettingsCancel = useCallback(() => {
    setSettingsWorkspaceId(null);
    setSettingsFolderId(null);
  }, []);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (deleteMenuTimerRef.current) {
        clearTimeout(deleteMenuTimerRef.current);
      }
    };
  }, []);

  const renderPrimary = () => {
    if (showHelp) {
      return <HelpView copy={copy} />;
    }

    if (activeWorkspaceSection === 'help') {
      return <HelpView copy={copy} />;
    }

    if (!activeCiWorkspaceId || !activeConfig) {
      return (
        <div className="adl-github__empty">
          <p>请选择一个工作区查看 CI 状态</p>
        </div>
      );
    }

    switch (activeWorkspaceSection) {
      case 'overview':
        return (
          <OverviewView
            snapshot={ciSnapshot}
            loading={loading}
            branch={activeConfig.branch}
            copy={copy}
            onViewLogs={handleViewLogs}
          />
        );
      case 'workflows':
        return <WorkflowsView snapshot={ciSnapshot} />;
      case 'jobs':
        return <JobsView snapshot={ciSnapshot} onViewLogs={handleViewLogs} />;
      case 'logs':
        return (
          <GitHubLogViewer
            snapshot={ciSnapshot}
            config={{
              owner: activeConfig.owner,
              repo: activeConfig.repo,
              branch: activeConfig.branch,
            }}
          />
        );
    }
  };

  return (
    <>
      <div
        className={`adl-tool-surface adl-tool-surface--github${communicateNavigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={{ '--adl-files-nav-width': '200px' } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label="GitHub CI">
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple
                content={gitHubAllTreeExpanded ? '全部折叠' : '全部展开'}
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={gitHubAllTreeExpanded ? collapseAllGitHubTree : expandAllGitHubTree}
                  aria-label={gitHubAllTreeExpanded ? '全部折叠' : '全部展开'}
                >
                  {gitHubAllTreeExpanded ? (
                    <IconFoldVertical size={14} decorative />
                  ) : (
                    <IconUnfoldVertical size={14} decorative />
                  )}
                </button>
              </TooltipSimple>
              <span className="adl-tool-navigator__context-title">
                {gitHubViewMode === 'tree' ? '文件树' : '目录列表'}
              </span>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <span className="adl-tool-navigator__context-count">{visibleWorkspaces.length}</span>
              <TooltipSimple content="刷新全部" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={handleRefreshAll}
                  aria-label="刷新全部"
                >
                  <IconRefreshCw size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple content="文件树" placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${gitHubViewMode === 'tree' ? ' is-active' : ''}`}
                  onClick={() => setGitHubViewMode('tree')}
                  aria-label="文件树"
                  aria-pressed={gitHubViewMode === 'tree'}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content="目录列表" placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${gitHubViewMode === 'list' ? ' is-active' : ''}`}
                  onClick={() => setGitHubViewMode('list')}
                  aria-label="目录列表"
                  aria-pressed={gitHubViewMode === 'list'}
                >
                  <IconList size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
            <div
              className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility"
              style={{ position: 'relative' }}
            >
              <TooltipSimple content="新建目录" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={handleCreateFolder}
                  aria-label="新建目录"
                >
                  <IconFolderPlus size={14} decorative />
                </button>
              </TooltipSimple>
              <button
                ref={deleteButtonRef}
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  clearDeleteMenuTimer();
                  setDeleteMenuHovering(true);
                  setDeleteMenuOpen(true);
                  setDeleteTooltipOpen(true);
                }}
                onMouseLeave={() => {
                  setDeleteMenuHovering(false);
                  // 延迟检查，确保鼠标不在菜单上
                  deleteMenuTimerRef.current = setTimeout(() => {
                    if (!isMouseOverDeleteUI()) {
                      setDeleteMenuOpen(false);
                      setDeleteTooltipOpen(false);
                    }
                  }, 100);
                }}
                aria-label="删除全部新建目录/CI配置/数据"
              >
                <TooltipSimple
                  content="删除全部新建目录/CI配置/数据"
                  placement="top"
                  id="github-delete-tooltip"
                  open={deleteTooltipOpen}
                  onOpenChange={(open) => {
                    clearDeleteMenuTimer();
                    if (open) {
                      setDeleteMenuHovering(true);
                      setDeleteMenuOpen(true);
                    }
                  }}
                >
                  <IconTrash size={14} decorative />
                </TooltipSimple>
              </button>
              {deleteMenuOpen && deleteButtonRef.current
                ? createPortal(
                    <div
                      className="adl-multitree-entry__menu"
                      role="menu"
                      data-menu-id="github-delete-all-menu"
                      onMouseEnter={() => {
                        clearDeleteMenuTimer();
                        setDeleteMenuHovering(true);
                        setDeleteTooltipOpen(true);
                      }}
                      onMouseLeave={() => {
                        setDeleteMenuHovering(false);
                        // 延迟检查，确保鼠标不在按钮或 tooltip 上
                        deleteMenuTimerRef.current = setTimeout(() => {
                          if (!isMouseOverDeleteUI()) {
                            setDeleteMenuOpen(false);
                            setDeleteTooltipOpen(false);
                          }
                        }, 100);
                      }}
                      style={{
                        position: 'fixed',
                        top: deleteButtonRef.current.getBoundingClientRect().bottom + 4,
                        left: deleteButtonRef.current.getBoundingClientRect().left,
                        zIndex: 99999,
                      }}
                    >
                      <MenuHintItem
                        label="删除全部新建目录"
                        hint="删除所有通过'新建目录'创建的目录节点及其CI配置和数据。工作区目录不受影响。"
                        onClick={() => {
                          clearAllFolders();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label="删除全部CI配置"
                        hint="清空所有工作区和文件夹绑定的GitHub仓库配置（owner/repo/branch/token）。保留目录结构和CI运行数据。"
                        onClick={() => {
                          clearAllCiConfigs();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label="删除全部数据"
                        hint="清空当前面板显示的所有CI运行状态（快照/作业列表/错误信息）。保留配置信息。"
                        onClick={() => {
                          clearCiState();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label="删除全部CI配置及数据"
                        hint="同时清空所有工作区和文件夹的GitHub配置以及所有CI运行数据。保留目录结构。"
                        onClick={() => {
                          clearAllCiConfigsAndData();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label="恢复还原"
                        hint="清空所有内容——删除所有新建目录、所有CI配置及数据，恢复到仅显示工作区目录顶级目录的初始状态。"
                        onClick={() => {
                          resetAllToOriginal();
                          setDeleteMenuOpen(false);
                        }}
                      />
                    </div>,
                    document.body
                  )
                : null}
              <TooltipSimple content="Help" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => setShowHelp(true)}
                  aria-label="Help"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-.5v2h.5a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5v-2.5a.5.5 0 0 1 .5-.5zm1 5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z" />
                  </svg>
                </button>
              </TooltipSimple>
            </div>
          </div>
          <GitHubTree
            workspaces={workspaces}
            gitHubWorkspaceConfigs={gitHubWorkspaceConfigs}
            gitHubCiFolders={gitHubCiFolders}
            gitHubTreeExpanded={gitHubTreeExpanded}
            selectedTreePath={selectedGitHubTreePath}
            onSelectTreePath={handleSelectTreePath}
            onTogglePath={handleTogglePath}
            callbacks={sectionCallbacks}
            labels={{
              ciWorkspaceCategory: '工作区目录',
              userFolderCategory: '非工作区目录',
            }}
            gitHubViewMode={gitHubViewMode}
          />
        </aside>

        <div className="adl-tool-primary adl-tool-primary--github">
          <div className="adl-tool-primary__scroll">{renderPrimary()}</div>
        </div>
      </div>

      {(settingsWorkspaceId || settingsFolderId) && (
        <GitHubSettingsDialog
          open={settingsWorkspaceId !== null || settingsFolderId !== null}
          workspaceName={settingsName}
          initialOwner={settingsInitialOwner}
          initialRepo={settingsInitialRepo}
          initialBranch={settingsInitialBranch}
          error={ciError}
          copy={copy}
          onSave={handleSettingsSave}
          onCancel={handleSettingsCancel}
        />
      )}
    </>
  );
}
