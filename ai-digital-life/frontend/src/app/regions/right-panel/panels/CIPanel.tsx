/**
 * CI 面板主组件
 * 支持状态展示和帮助文档两个 Tab
 */
import React, { useState } from 'react';
import { useCIPanelProps } from '../hooks/useCIPanelProps';
import { CIPanelStatus } from './CIPanelStatus';
import { CIPanelHelp } from './CIPanelHelp';
import { CIPanelTooltip } from './CIPanelTooltip';
import { workspaceSelectors } from '../../../stores/selectors';
import { getAppCopy } from '../../../i18n';

type CiTab = 'status' | 'help';

export function CIPanel() {
  const [activeTab, setActiveTab] = useState<CiTab>('status');
  const [showTooltip, setShowTooltip] = useState(false);
  const { config, accessToken, loading, error, snapshot, onRefresh, onConfigChange, onClearToken } =
    useCIPanelProps();
  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

  const handleOpenTooltip = () => setShowTooltip(true);
  const handleCloseTooltip = () => setShowTooltip(false);

  return (
    <div className="adl-ci">
      <header className="adl-ci__header">
        <nav className="adl-ci__tabs">
          <button
            type="button"
            className={`adl-ci__tab ${activeTab === 'status' ? 'adl-ci__tab--active' : ''}`}
            onClick={() => setActiveTab('status')}
          >
            {copy.ciTabStatus}
          </button>
          <button
            type="button"
            className={`adl-ci__tab ${activeTab === 'help' ? 'adl-ci__tab--active' : ''}`}
            onClick={() => setActiveTab('help')}
          >
            {copy.ciTabHelp}
          </button>
        </nav>
        <div className="adl-ci__header-actions">
          {activeTab === 'status' && (
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={handleOpenTooltip}
              title="快速帮助"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                <path d="M6.5 5.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm.25 3.25a.25.25 0 0 1 .25.25v.25h.25a.25.25 0 0 1 0 .5H6.5a.25.25 0 0 1-.25-.25v-.25a.25.25 0 0 1 .25-.25h.25z" />
              </svg>
            </button>
          )}
          {activeTab === 'status' && (
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={onRefresh}
              disabled={loading}
              title="刷新"
            >
              <svg
                viewBox="0 0 16 16"
                width="12"
                height="12"
                fill="currentColor"
                style={{ animation: loading ? 'spin 1s linear infinite' : undefined }}
              >
                <path d="M8 1a7 7 0 1 0 6.35 4.14l-1.1-1.1A5.5 5.5 0 1 1 8 2v1.5l2-2L8 3V2a6 6 0 1 0 0 12V11l-2-2V10A6 6 0 0 0 8 1z" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="adl-ci__content">
        {activeTab === 'status' && (
          <CIPanelStatus
            config={config}
            accessToken={accessToken}
            loading={loading}
            error={error}
            snapshot={snapshot}
            onConfigChange={onConfigChange}
            onClearToken={onClearToken}
          />
        )}
        {activeTab === 'help' && <CIPanelHelp />}
      </div>

      {showTooltip && <CIPanelTooltip onClose={handleCloseTooltip} />}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .adl-ci {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .adl-ci__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          height: 36px;
        }
        .adl-ci__tabs {
          display: flex;
          gap: 4px;
        }
        .adl-ci__tab {
          padding: 6px 12px;
          font-size: var(--text-xs);
          font-weight: 500;
          color: var(--text-tertiary);
          background: none;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: color 0.15s, background 0.15s;
        }
        .adl-ci__tab:hover {
          color: var(--text-secondary);
          background: var(--surface-hover);
        }
        .adl-ci__tab--active {
          color: var(--text-primary);
          background: var(--surface-secondary);
        }
        .adl-ci__header-actions {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .adl-ci__content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  );
}
