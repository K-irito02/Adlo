import { useCallback, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { HintCard, useHintCard } from '@components/HintCard';

export interface GitInitEmptyStateProps {
  workspaceId: string;
  workspacePath: string;
  /** 树加载 / 初始化失败信息（可选，内联展示在按钮下方）。 */
  error?: string;
}

/**
 * 变更面板「已添加工作区但不是 Git 仓库」空状态。
 *
 * 版式（用户 2026-11-07 指定）：无卡片底色、无 Git 图标；「非 Git 仓库 + !」
 * 水平居中，`!` 在名称右侧并承载完整说明（什么是 / 为什么需要 / 初始化后变化，
 * 以及「只初始化本地仓库」）。按钮直接执行本地 `git init`。
 */
export function GitInitEmptyState({ workspaceId, workspacePath, error }: GitInitEmptyStateProps) {
  const { t } = useTCopy();
  const [busy, setBusy] = useState(false);
  const { hintState, showHint, scheduleHide, hintCardProps } = useHintCard();

  const handleInit = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await useAppStore.getState().initGitRepo(workspaceId, workspacePath);
    } finally {
      setBusy(false);
    }
  }, [busy, workspaceId, workspacePath]);

  return (
    <div className="adl-changes-nongit">
      <span className="adl-changes-nongit__title">{t.changesNonGitRepoTitle as string}</span>
      <button
        type="button"
        className="adl-btn adl-btn--sm adl-changes-nongit__init-btn"
        disabled={busy}
        onClick={() => void handleInit()}
      >
        <span>
          {busy
            ? (t.changesNonGitRepoInitializing as string)
            : (t.changesNonGitRepoInitAction as string)}
        </span>
        <span
          className="adl-changes-nongit__hint"
          role="img"
          aria-label={t.changesNonGitRepoHintLabel as string}
          tabIndex={0}
          onMouseEnter={(e) => {
            e.stopPropagation();
            const button = (e.currentTarget as HTMLElement).closest('button');
            showHint(
              t.changesNonGitRepoHint as string,
              (button ?? (e.currentTarget as HTMLElement)).getBoundingClientRect(),
            );
          }}
          onMouseLeave={scheduleHide}
          onFocus={(e) => {
            const button = (e.currentTarget as HTMLElement).closest('button');
            showHint(
              t.changesNonGitRepoHint as string,
              (button ?? (e.currentTarget as HTMLElement)).getBoundingClientRect(),
            );
          }}
          onBlur={scheduleHide}
          onClick={(e) => e.stopPropagation()}
        >
          !
        </span>
      </button>
      {error ? <p className="adl-changes-nongit__error">{error}</p> : null}
      <HintCard {...hintCardProps} placement="right">
        {hintState?.content}
      </HintCard>
    </div>
  );
}
