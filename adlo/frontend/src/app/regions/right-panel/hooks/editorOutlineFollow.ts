/**
 * 编辑器正文 → 文档大纲的防抖跟手（文件面板大纲锚点）。
 *
 * 与 `scheduleSelectedAutoReload` 同思路：闭包锁定"事件时刻"的文件 + 工作区，
 * 落定时重新读取当前选区与最新文本，避免旧文件的正文被用来给新文件生成大纲。
 * 抽成独立模块以便用 fake timers 直接锁死去抖与守卫语义。
 */

import type { FileOutlineItem } from '@adlo/kernel';

/** 打字后重建大纲的防抖窗口：停顿即刷新锚点，连续输入不重复 walk。 */
export const OUTLINE_FOLLOW_DEBOUNCE_MS = 400;

export interface OutlineFollowSelection {
  path: string | undefined;
  workspaceId: string | undefined;
}

export interface OutlineFollowOptions {
  /** 落定时刻读最新选区（文件 + 所属工作区）。 */
  selection: () => OutlineFollowSelection;
  /** 落定时刻读最新正文（草稿优先）；`undefined` 表示无可用正文，放弃本次。 */
  readText: (path: string, workspaceId: string | undefined) => string | undefined;
  /** 写出大纲（调用方负责重型文本判定）。 */
  apply: (path: string, text: string) => void;
}

export interface OutlineFollow {
  schedule(path: string, workspaceId: string | undefined): void;
  cancel(): void;
}

export function createOutlineFollow(options: OutlineFollowOptions): OutlineFollow {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let target: { path: string; workspaceId: string | undefined } | undefined;

  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    target = undefined;
  };

  return {
    schedule(path, workspaceId) {
      cancel();
      target = { path, workspaceId };
      timer = setTimeout(() => {
        timer = undefined;
        const pending = target;
        target = undefined;
        if (!pending) {
          return;
        }
        const selected = options.selection();
        if (selected.path !== pending.path || selected.workspaceId !== pending.workspaceId) {
          // 已切到别的文件/工作区：旧正文不得写进新选区的大纲。
          return;
        }
        const text = options.readText(pending.path, pending.workspaceId);
        if (text === undefined) {
          return;
        }
        options.apply(pending.path, text);
      }, OUTLINE_FOLLOW_DEBOUNCE_MS);
    },
    cancel,
  };
}

/** hook 侧接线所需的最小 store 形状（避免把 StoreState 依赖带进纯模块）。 */
export interface EditorOutlineFollowState {
  selectedFilePath?: string;
  selectedFileWorkspaceId?: string;
  fileContent?: string;
  setOutline: (outline: FileOutlineItem[]) => void;
}

export interface EditorOutlineFollowDeps {
  getState: () => EditorOutlineFollowState;
  readDraft: (path: string, workspaceId: string | undefined) => string | undefined;
  toOutline: (path: string, text: string) => FileOutlineItem[];
}

/**
 * 把 store 接线固定成可测的一层：选区/正文都取落定时刻的最新值，
 * 正文优先草稿、回退已保存基线，最后写入 `setOutline`。
 */
export function createEditorOutlineFollow(deps: EditorOutlineFollowDeps): OutlineFollow {
  return createOutlineFollow({
    selection: () => {
      const state = deps.getState();
      return { path: state.selectedFilePath, workspaceId: state.selectedFileWorkspaceId };
    },
    readText: (path, workspaceId) =>
      deps.readDraft(path, workspaceId) ?? deps.getState().fileContent,
    apply: (path, text) => {
      deps.getState().setOutline(deps.toOutline(path, text));
    },
  });
}
