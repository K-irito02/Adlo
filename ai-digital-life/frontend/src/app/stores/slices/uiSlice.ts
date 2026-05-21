/**
 * UI 切片
 * 管理通用的 UI 状态，保持向后兼容
 */
import { type ToolId } from "../../ui-store";
import type { StoreState } from "../StoreState";

// 导出类型定义，与 slices.ts 保持一致
export interface UISlice {
  leftSidebarVisible: boolean;
  rightPanelVisible: boolean;
  activeRightTool: ToolId;
  currentModel: string;
  composerMessage: string;

  setLeftSidebarVisible: (visible: boolean) => void;
  setRightPanelVisible: (visible: boolean) => void;
  setActiveRightTool: (tool: ToolId) => void;
  setCurrentModel: (model: string) => void;
  setComposerMessage: (message: string) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
}

/**
 * UI 切片创建器
 */
export const createUISlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): UISlice => ({
  leftSidebarVisible: true,
  rightPanelVisible: true,
  activeRightTool: 'files',
  currentModel: 'GPT-4o',
  composerMessage: '',

  setLeftSidebarVisible: (visible) => set({ leftSidebarVisible: visible }),
  setRightPanelVisible: (visible) => set({ rightPanelVisible: visible }),
  setActiveRightTool: (tool) => set({ activeRightTool: tool }),
  setCurrentModel: (model) => set({ currentModel: model }),
  setComposerMessage: (message) => set({ composerMessage: message }),
  toggleLeftSidebar: () => set((s) => ({ leftSidebarVisible: !s.leftSidebarVisible })),
  toggleRightSidebar: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible }))
});
