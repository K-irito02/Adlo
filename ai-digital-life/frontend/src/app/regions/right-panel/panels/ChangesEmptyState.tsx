interface ChangesEmptyStateProps {
  hasWorkspaces: boolean;
  message?: string;
}

export function ChangesEmptyState({ hasWorkspaces, message }: ChangesEmptyStateProps) {
  return (
    <div className="adl-changes-empty">
      <p className="adl-changes-empty__text">
        {message ?? (hasWorkspaces ? '当前没有检测到文件变更' : '打开工作区以查看变更')}
      </p>
    </div>
  );
}
