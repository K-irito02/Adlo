/**
 * 右键菜单「剪贴板」项 id（契约）。
 *
 * 基础菜单（`useFileContextMenuItems`）负责产出这些 id；`bindWorkspaceClipboard`
 * 按同一组 id 改写 action（记录来源工作区 / 跨区粘贴）。两处共用常量，
 * 避免字符串漂移导致「捕获不到复制项」这类静默失效（2026-11-19 实测：`copy-op` 被写成 `copy`）。
 */
export const FILE_CLIPBOARD_MENU_IDS = {
  cut: 'cut',
  copy: 'copy-op',
  paste: 'paste',
} as const;
