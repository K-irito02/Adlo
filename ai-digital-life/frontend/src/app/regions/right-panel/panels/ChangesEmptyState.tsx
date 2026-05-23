import { IconGitBranch } from "../../../icons";

interface ChangesEmptyStateProps {
  hasWorkspaces: boolean;
  message?: string;
}

export function ChangesEmptyState({ hasWorkspaces, message }: ChangesEmptyStateProps) {
  return (
    <div className="adl-tool-empty">
      <div className="adl-empty-icon"><IconGitBranch size={32} decorative /></div>
      <p className="adl-empty-text">{message ?? (hasWorkspaces ? "当前没有检测到文件变更" : "打开工作区以查看变更")}</p>
    </div>
  );
}
