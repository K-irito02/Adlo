import React, { useEffect, useRef, useState } from 'react';
import { IconFolder, IconFolderOpen, IconLightbulb, IconMessageSquare } from '../../icons';
import { WorkspaceSplitButton } from '../../components/WorkspaceSplitButton';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import { useTCopy } from '../../i18n/useTCopy';

export interface WelcomeStateProps {
  hasWorkspace: boolean;
  recentWorkspaces: RecentWorkspaceEntry[];
  onOpenWorkspace: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onPickWorkspaceDirectory: () => Promise<string | undefined>;
  onCreateSession: () => void;
}

export function WelcomeState({
  hasWorkspace,
  recentWorkspaces,
  onOpenWorkspace,
  onPickWorkspaceDirectory,
  onCreateSession,
}: WelcomeStateProps) {
  const { t } = useTCopy();
  const [showActionCard, setShowActionCard] = useState(false);
  const actionCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showActionCard) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (actionCardRef.current && !actionCardRef.current.contains(event.target as Node)) {
        setShowActionCard(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showActionCard]);

  if (!hasWorkspace) {
    return (
      <div className="adl-welcome adl-welcome--panel" aria-label={t.welcomeStartChatTitle}>
        <section className="adl-welcome__recent" aria-label={t.welcomeRecentWorkspaces}>
          <header className="adl-welcome__section-header">
            <h3>{t.welcomeRecentWorkspaces}</h3>
          </header>
          {recentWorkspaces.length ? (
            <ul className="adl-welcome__recent-list">
              {recentWorkspaces.slice(0, 5).map((workspace) => (
                <li key={workspace.path}>
                  <button type="button" onClick={() => onOpenWorkspace(workspace.path)}>
                    <span className="adl-welcome__recent-icon" aria-hidden="true">
                      <IconFolder size={14} decorative />
                    </span>
                    <span className="adl-welcome__recent-name">{workspace.name}</span>
                    <span className="adl-welcome__path">{workspace.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="adl-welcome__empty">{t.workspaceRecentEmpty}</p>
          )}
        </section>

        <div className="adl-welcome__actionsbar" aria-label={t.welcomeQuickActions}>
          <button type="button" className="adl-btn adl-btn--lg" onClick={onCreateSession}>
            <IconMessageSquare size={16} decorative />
            {t.newConversation}
          </button>
          <div className="adl-welcome__action-wrap" ref={actionCardRef}>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--lg"
              onClick={() => setShowActionCard((v) => !v)}
            >
              <IconFolderOpen size={16} decorative />
              {t.welcomeOpenWorkspace}
            </button>
            {showActionCard ? (
              <div className="adl-welcome__action-card">
                <div className="adl-statusbar__menu-section">
                  <strong className="adl-statusbar__menu-subtitle">{t.workspaceOpenTitle}</strong>
                  <WorkspaceSplitButton
                    onPickWorkspaceDirectory={onPickWorkspaceDirectory}
                    onOpenWorkspace={onOpenWorkspace}
                    onClose={() => setShowActionCard(false)}
                    initialMode="pick"
                    persistMode={false}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <section className="adl-welcome__hints" aria-label={t.welcomeHints}>
          <header className="adl-welcome__section-header">
            <IconLightbulb size={16} decorative />
            <span>{t.welcomeHints}</span>
          </header>
          <ul>
            <li>{t.welcomeHintDrag}</li>
            <li>{t.welcomeHintOpen}</li>
            <li>{t.welcomeHintNewWorkspace}</li>
            <li>{t.welcomeHintNewSession}</li>
          </ul>
        </section>
      </div>
    );
  }

  return <div className="adl-empty-stream" aria-hidden="true" />;
}
