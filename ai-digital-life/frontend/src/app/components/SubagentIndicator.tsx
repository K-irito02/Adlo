import { useAppStore } from '../stores/slicedStore';
import { useTCopy } from '../i18n/useTCopy';

/**
 * SubagentIndicator - 显示活跃子代理任务的状态徽章
 * 列出所有 running/completed/failed 的子代理任务
 */
export function SubagentIndicator() {
  const { t } = useTCopy();
  const activeSubagents = useAppStore((s) => s.activeSubagents);

  if (activeSubagents.length === 0) {
    return null;
  }

  const statusLabel = (status: string): string => {
    if (status === 'running') {
      return t.agentSubagentRunning;
    }
    if (status === 'completed') {
      return t.agentSubagentCompleted;
    }
    return t.agentSubagentFailed;
  };

  return (
    <div className="adl-subagent-indicator" role="status" aria-live="polite">
      {activeSubagents.map((task) => (
        <span key={task.id} className={`adl-subagent-badge adl-subagent-${task.status}`}>
          {t.agentSubagentTask}: {task.subagent_type} — {statusLabel(task.status)}
        </span>
      ))}
    </div>
  );
}
