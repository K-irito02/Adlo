import { ConfirmDialog } from '@components/ConfirmDialog';
import { formatT } from '@i18n/formatT';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';

/**
 * 由 App 根部挂载的 3080 端口占用确认框。
 *
 * 打开 dsh 的所有入口共用 store 里的 `dshPortConflict`：后端在端口被占用时
 * 不再静默杀进程，而是返回占用者列表；这里说明「谁占着、会发生什么」，
 * 用户确认后才以 force=true 结束占用进程并重启项目内版本。
 *
 * 单进程内联在正文里；多进程逐行列出。警告放在问句之前，避免读成事后补充。
 */
export function DshPortConflictDialog() {
  const { t } = useTCopy();
  const conflict = useAppStore((s) => s.dshPortConflict);
  const resolve = useAppStore((s) => s.resolveDshPortConflict);

  if (!conflict) {
    return null;
  }

  const single = conflict.processes.length === 1;
  const processText = (process: (typeof conflict.processes)[number]) =>
    formatT(t, 'dshPortConflictProcess', { name: process.name, pid: process.pid });
  const message = single
    ? formatT(t, 'dshPortConflictMessage', { processes: processText(conflict.processes[0]) })
    : t.dshPortConflictMessageMulti;
  const hasOther = conflict.processes.some((process) => !process.isDsh);
  const question = hasOther
    ? `${t.dshPortConflictOtherWarning}${t.dshPortConflictWarningSuffix}${t.dshPortConflictQuestion}`
    : t.dshPortConflictQuestion;
  const details = single ? undefined : (
    <ul className="adl-confirm-dialog__details">
      {conflict.processes.map((process) => (
        <li key={process.pid}>{processText(process)}</li>
      ))}
    </ul>
  );

  return (
    <ConfirmDialog
      open
      title={t.dshPortConflictTitle}
      message={message}
      details={details}
      question={question}
      confirmLabel={t.dshPortConflictConfirm}
      cancelLabel={t.dshPortConflictCancel}
      tone="danger"
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  );
}
