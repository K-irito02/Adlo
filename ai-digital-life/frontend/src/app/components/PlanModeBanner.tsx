import { useAppStore } from '../stores/slicedStore';
import { useTCopy } from '../i18n/useTCopy';

/**
 * PlanModeBanner - Plan 模式激活时显示的横幅
 * 显示只读提示和退出按钮
 */
export function PlanModeBanner() {
  const { t } = useTCopy();
  const planModeActive = useAppStore((s) => s.planModeActive);
  const exitPlanMode = useAppStore((s) => s.exitPlanMode);
  const currentWorkspaceId = useAppStore((s) => s.appInfo?.currentWorkspace?.id);

  if (!planModeActive) {
    return null;
  }

  return (
    <div className="adl-plan-mode-banner" role="status">
      <span>
        {t.agentPlanModeActive} — {t.agentPlanModeReadonly}
      </span>
      <button
        type="button"
        onClick={() => {
          if (currentWorkspaceId) {
            void exitPlanMode(currentWorkspaceId);
          }
        }}
      >
        {t.agentPlanModeExit}
      </button>
    </div>
  );
}
