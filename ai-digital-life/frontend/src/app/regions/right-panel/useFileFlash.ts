import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';

/**
 * 折叠目录闪烁提示（事项 2 根因修复）：目标文件位于被手动折叠的目录内时，
 * 返回最浅被折叠祖先路径，调用方据此闪烁该行；1000ms 后自动清除。
 *
 * 时序关键：必须等该工作区树到达后再判定 —— 树未到时行不在虚列表里，
 * 此时起计时等于空闪（旧实现恰因此丢失提示）。树到达（absent→present）
 * 会自动重放一次；刷新（present→present）不重放。
 * 纯组件本地状态：不写盘、不进 store。
 */
export function useFileFlash(
  selectedFilePath: string | undefined,
  workspaceId: string | undefined,
): string | undefined {
  const expandFileTreePathChain = useAppStore((s) => s.expandFileTreePathChain);
  const treeLoaded = useAppStore((s) =>
    workspaceId === undefined ? false : s.workspaceTrees[workspaceId] !== undefined,
  );
  const [flashPath, setFlashPath] = useState<string | undefined>(undefined);
  const flashTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!selectedFilePath || !workspaceId || !treeLoaded) {
      return;
    }
    const { blocked } = expandFileTreePathChain(workspaceId, selectedFilePath);
    // TEMP-RCA(事项2): 记录判定输入与结果供用户实测验证（定案前删除）
    console.log('[ADL-DBG-RCA] flash check', {
      selectedFilePath,
      activeWorkspaceId: workspaceId,
      blocked,
      treeLoaded,
      manualCollapsed: useAppStore.getState().expandedFileTreePaths[workspaceId]?.manualCollapsed,
    });
    if (blocked.length === 0) {
      // 无被折叠祖先：不打断正在进行的闪烁，让上一次闪烁自然结束。
      return;
    }
    // blocked 按浅→深排序，blocked[0] 是最浅的被折叠祖先 —— 其上方已全部展开，
    // 该行必然在虚列表中可见；更深层的行可能被折叠的父级隐藏，闪了也看不见。
    window.clearTimeout(flashTimerRef.current);
    setFlashPath(blocked[0]);
    flashTimerRef.current = window.setTimeout(() => setFlashPath(undefined), 1000);
  }, [expandFileTreePathChain, selectedFilePath, workspaceId, treeLoaded]);

  useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);

  return flashPath;
}
