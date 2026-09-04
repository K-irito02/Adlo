import React from 'react';
import { useTCopy } from '@i18n/useTCopy';

interface GitNotRepoHintProps {
  /** Optional custom message to display */
  message?: string;
  /** Additional class name */
  className?: string;
}

export const GitNotRepoHint = React.memo(function GitNotRepoHint({
  message,
  className = '',
}: GitNotRepoHintProps) {
  const { t } = useTCopy();
  return (
    <div className={`adl-git-vis__not-repo-hint ${className}`}>
      <p className="adl-git-vis__not-repo-hint-text">{message ?? t.gitVisNotGitRepo}</p>
    </div>
  );
});
