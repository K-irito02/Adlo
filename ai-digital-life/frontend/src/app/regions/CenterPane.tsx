import React, { useCallback } from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { useAppStore } from '../stores/slicedStore';
import { useAppActions } from '../hooks/useAppActions';

/**
 * 中部主区域 — dsh 承载占位。
 *
 * 会话/聊天 UI 已随 dsh 剥离删除。此区域暂为欢迎占位，
 * 将来由 dsh 插件在此渲染其主界面。左右两侧栏保留。
 */
const CenterPane = React.memo(function CenterPane() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const appReady = useAppStore((s) => s.appReady);

  const handleOpenWorkspace = useCallback(() => {
    void actions.pickWorkspaceDirectory().then((picked) => {
      if (picked) {
        void actions.openWorkspace(picked);
      }
    });
  }, [actions]);

  return (
    <section className="adl-center adl-center--dsh-placeholder" aria-label={t.conversation}>
      <div className="adl-center__body adl-center__body--empty">
        <div className="adl-center__empty">
          {appReady ? (
            <button
              type="button"
              className="welcome-state__primary-btn"
              onClick={handleOpenWorkspace}
            >
              {t.welcomeOpenWorkspace}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
});

export { CenterPane };
