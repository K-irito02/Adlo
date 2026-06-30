import { useTCopy } from '@i18n/useTCopy';

interface ChangesEmptyStateProps {
  hasWorkspaces: boolean;
  message?: string;
}

export function ChangesEmptyState({ hasWorkspaces, message }: ChangesEmptyStateProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-changes-empty">
      <p className="adl-changes-empty__text">
        {message ?? (hasWorkspaces ? t.changesNoChanges : t.changesOpenWorkspace)}
      </p>
    </div>
  );
}
