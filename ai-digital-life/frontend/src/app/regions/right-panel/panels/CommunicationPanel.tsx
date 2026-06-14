import React, { useState, useMemo } from 'react';
import { useCommunicationPanelProps } from '../hooks/useCommunicationPanelProps';
import { GitHubPanel } from './communicate/GitHubPanel';
import { FeishuPanel } from './communicate/FeishuPanel';
import { QQPanel } from './communicate/QQPanel';
import { WeChatPanel } from './communicate/WeChatPanel';
import { EmailPanel } from './communicate/EmailPanel';
import type { PlatformId } from '../../../stores/slices/communicateSlice';
import { useTCopy } from '../../../i18n/useTCopy';

export function CommunicationPanel() {
  const { t } = useTCopy();
  const { activePlatform, onSetActivePlatform } = useCommunicationPanelProps();
  const [hoveredPlatform, setHoveredPlatform] = useState<PlatformId | null>(null);

  const PLATFORM_TABS = useMemo<Array<{ id: PlatformId; label: string; icon: React.ReactNode }>>(
    () => [
      {
        id: 'github',
        label: t.communicateTabGitHub,
        icon: (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        ),
      },
      {
        id: 'feishu',
        label: t.communicateTabFeishu,
        icon: (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 13.5 1h-11zM3 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-1zm0 3a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5z" />
          </svg>
        ),
      },
      {
        id: 'qq',
        label: t.communicateTabQQ,
        icon: (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M4 2a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1.5v2.5a.5.5 0 0 0 .85.36L9.21 11H12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H9a.5.5 0 0 0-.36.15L6.5 12.29V10.5a.5.5 0 0 0-.5-.5H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
            <path d="M6.5 5.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.52h2.5a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.48z" />
          </svg>
        ),
      },
      {
        id: 'wechat',
        label: t.communicateTabWechat,
        icon: (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M0 6.5C0 3.48 2.69 1 6 1c3.31 0 6 2.48 6 5.5S9.31 12 6 12c-.63 0-1.24-.1-1.81-.29C3.65 12.53 2.77 13 1.5 13c.08-.45.17-.89.25-1.34.08-.44.16-.88.21-1.34C.67 9.35 0 7.99 0 6.5zm6-1.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1zm-2 0a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z" />
            <path d="M8.53 12.36c.47-.22.97-.5 1.4-.86A4.5 4.5 0 0 0 12 7c0-.38-.04-.74-.13-1.09C13.16 6.5 14 7.9 14 9.5c0 1.07-.48 2.03-1.25 2.7.05.34.11.67.18 1 .08.32.16.63.22.95-.93-.39-1.57-.73-2.28-1.17-.4.13-.83.2-1.27.2a3.5 3.5 0 0 1-.77-.09l-.3.27z" />
          </svg>
        ),
      },
      {
        id: 'email',
        label: t.communicateTabEmail,
        icon: (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414.05 3.555zM0 4.697v7.104l5.803-3.558L0 4.697zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586l-1.239-.757zm3.436-.586L16 11.801V4.697l-5.803 3.546z" />
          </svg>
        ),
      },
    ],
    [t]
  );

  const PANEL_COMPONENTS: Record<PlatformId, React.ComponentType> = {
    github: GitHubPanel,
    feishu: FeishuPanel,
    qq: QQPanel,
    wechat: WeChatPanel,
    email: EmailPanel,
  };
  const Panel = PANEL_COMPONENTS[activePlatform] ?? GitHubPanel;

  return (
    <div className="adl-communicate">
      <div className="adl-communicate__platform-tabs" role="tablist">
        {PLATFORM_TABS.map((tab, index) => {
          const isHighlighted = activePlatform === tab.id || hoveredPlatform === tab.id;
          const nextTab = PLATFORM_TABS[index + 1];
          const shouldShowSeparator =
            !!nextTab &&
            isHighlighted &&
            (activePlatform === nextTab.id || hoveredPlatform === nextTab.id);
          return (
            <React.Fragment key={tab.id}>
              <button
                type="button"
                className={`adl-communicate__platform-tab${activePlatform === tab.id ? ' is-active' : ''}`}
                onClick={() => onSetActivePlatform(tab.id)}
                role="tab"
                aria-selected={activePlatform === tab.id}
                onMouseEnter={() => setHoveredPlatform(tab.id)}
                onMouseLeave={() =>
                  setHoveredPlatform((current) => (current === tab.id ? null : current))
                }
              >
                <span className="adl-communicate__platform-tab-icon">{tab.icon}</span>
                <span className="adl-communicate__platform-tab-label">{tab.label}</span>
              </button>
              {index < PLATFORM_TABS.length - 1 ? (
                <span
                  className={`adl-communicate__platform-separator${shouldShowSeparator ? ' is-visible' : ''}`}
                  aria-hidden="true"
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      <div className="adl-communicate__surface">
        <Panel />
      </div>
    </div>
  );
}
