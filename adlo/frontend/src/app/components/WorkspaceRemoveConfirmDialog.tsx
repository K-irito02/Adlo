import { useTCopy } from '@i18n/useTCopy';
import { ConfirmDialog } from './ConfirmDialog';
import { formatT } from '@i18n/formatT';

interface WorkspaceRemoveConfirmDialogProps {
  open: boolean;
  workspaceName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 「移出该工作区」的确认对话框。该操作不可逆（彻底移出并清理数据），
 * 各右侧面板菜单在触发 removeWorkspaceFromSidebar 前统一弹出确认。
 */
export function WorkspaceRemoveConfirmDialog({
  open,
  workspaceName,
  onConfirm,
  onCancel,
}: WorkspaceRemoveConfirmDialogProps) {
  const { t } = useTCopy();
  return (
    <ConfirmDialog
      open={open}
      title={t.workspaceRemoveConfirmTitle}
      message={formatT(t, 'workspaceRemoveConfirmMessage', { name: workspaceName })}
      confirmLabel={t.workspaceRemoveEntry}
      cancelLabel={t.cancel}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
