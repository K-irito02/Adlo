/**
 * UI 切片
 * 管理通用的 UI 状态，保持向后兼容
 */
import { type ToolId } from "../../ui-store";
import type { StoreState } from "../StoreState";

// 导出类型定义，与 slices.ts 保持一致
export interface UISlice {
  activeRightTool: ToolId;

  setActiveRightTool: (tool: ToolId) => void;
}

/**
 * UI 切片创建器
 */
export const createUISlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): UISlice => ({
  activeRightTool: 'files',

  setActiveRightTool: (tool) => set({ activeRightTool: tool })
});
