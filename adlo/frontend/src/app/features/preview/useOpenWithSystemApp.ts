import { useCallback } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { resolveWorkspaceRootForMedia } from '@stores/mediaSourceResolver';

/**
 * 「用系统播放器打开 / 用系统默认程序打开」的唯一实现（事项 11）。
 *
 * 内置 Chromium 与浏览器标签是同一解码器，解不了的编码/容器换标签也没用；
 * 系统默认程序才是真正能打开它的地方。失败（根不可解析 / 桥接报错）统一弹 toast，
 * 不把错误静默掉。
 */
export function useOpenWithSystemApp(workspaceId: string | undefined) {
  const { t } = useTCopy();
  return useCallback(
    (filePath: string) => {
      const state = useAppStore.getState();
      const root = resolveWorkspaceRootForMedia(state, workspaceId);
      if (!root) {
        state.showToast(t.mediaOpenWithSystemFailed as string, 'error');
        return;
      }
      void window.digitalLife.workspace.openInDefaultApp(root, filePath).then((result) => {
        if (!result.ok) {
          state.showToast(t.mediaOpenWithSystemFailed as string, 'error');
        }
      });
    },
    [workspaceId, t.mediaOpenWithSystemFailed],
  );
}
