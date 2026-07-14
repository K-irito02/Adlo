import { useCallback, useRef, useState } from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { Icon } from './Icon';

interface WelcomeStateProps {
  variant: 'no-workspace' | 'no-session';
  recentWorkspaces?: Array<{ path: string; name: string }>;
  onOpenWorkspace: () => void;
  onSelectRecentWorkspace: (path: string) => void;
  onSuggestion?: (text: string) => void;
}

export function WelcomeState({
  variant,
  recentWorkspaces = [],
  onOpenWorkspace,
  onSelectRecentWorkspace,
  onSuggestion,
}: WelcomeStateProps) {
  const { t } = useTCopy();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const SUGGESTIONS = [
    t.welcomeSuggestionArchitecture,
    t.welcomeSuggestionBug,
    t.welcomeSuggestionTest,
    t.welcomeSuggestionPerformance,
    t.welcomeSuggestionExplain,
  ];

  const TIPS = [
    { icon: 'folder-open' as const, text: t.welcomeHintDrag },
    { icon: 'keyboard' as const, text: t.welcomeHintOpen },
    { icon: 'globe' as const, text: t.welcomeHintClone },
  ];

  const filteredWorkspaces = searchQuery.trim()
    ? recentWorkspaces.filter(
        (ws) =>
          ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ws.path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : recentWorkspaces;

  const handleSuggestionClick = useCallback(
    (text: string) => {
      onSuggestion?.(text);
    },
    [onSuggestion]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, path: string) => {
      if (e.key === 'Enter') {
        onSelectRecentWorkspace(path);
      }
    },
    [onSelectRecentWorkspace]
  );

  if (variant === 'no-session') {
    return (
      <div className="welcome-state">
        <div className="welcome-state__icon welcome-state__icon--session">
          <Icon name="message-square" size="2xl" />
        </div>
        <h2 className="welcome-state__title">{t.welcomeStartChatTitle}</h2>
        <p className="welcome-state__description">{t.welcomeStartChatDescription}</p>
        <div className="welcome-state__suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="welcome-state__chip"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-state">
      <div className="welcome-state__icon">
        <Icon name="folder-open" size="2xl" />
      </div>
      <h2 className="welcome-state__title">{t.welcomeOpenWorkspace}</h2>
      <p className="welcome-state__description">{t.welcomeOpenWorkspaceDescription}</p>

      <button type="button" className="welcome-state__primary-btn" onClick={onOpenWorkspace}>
        <Icon name="folder-open" size="sm" />
        {t.welcomeOpenWorkspace}
      </button>

      {recentWorkspaces.length > 0 && (
        <>
          <p className="welcome-state__recent-label">{t.welcomeRecentWorkspaces}</p>
          <div className="welcome-state__search" role="search">
            <Icon name="search" size="sm" />
            <input
              ref={searchInputRef}
              type="text"
              className="welcome-state__search-input"
              placeholder={t.welcomeSearchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t.welcomeSearchAria}
            />
          </div>
          <ul className="welcome-state__list" role="listbox" aria-label={t.welcomeRecentAria}>
            {filteredWorkspaces.slice(0, 5).map((workspace) => (
              <li key={workspace.path}>
                <button
                  type="button"
                  className="welcome-state__item"
                  onClick={() => onSelectRecentWorkspace(workspace.path)}
                  onKeyDown={(e) => handleKeyDown(e, workspace.path)}
                  role="option"
                  aria-selected={false}
                >
                  <Icon name="folder-open" size="sm" />
                  <span className="welcome-state__item-name">{workspace.name}</span>
                  <span className="welcome-state__item-path">{workspace.path}</span>
                </button>
              </li>
            ))}
            {filteredWorkspaces.length === 0 && searchQuery.trim() && (
              <li className="welcome-state__empty">{t.welcomeNoMatch}</li>
            )}
          </ul>
        </>
      )}

      <div className="welcome-state__divider">
        <span>{t.welcomeOr}</span>
      </div>

      <div className="welcome-state__tips">
        <div className="welcome-state__tips-header">
          <Icon name="lightbulb" size="sm" />
          <span>{t.welcomeHints}</span>
        </div>
        <ul className="welcome-state__tips-list">
          {TIPS.map((tip) => (
            <li key={tip.text} className="welcome-state__tip">
              <Icon name={tip.icon} size="xs" />
              <span>{tip.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default WelcomeState;
export type { WelcomeStateProps };
