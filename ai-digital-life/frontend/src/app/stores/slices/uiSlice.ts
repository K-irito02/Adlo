/**
 * UI 切片
 * 管理通用的 UI 状态，保持向后兼容
 */
import { type ToolId } from "../../ui-store";
import type { ChatMode } from "../../ui-store";
import type { StoreState } from "../StoreState";

export interface UISlice {
  activeRightTool: ToolId;
  chatMode: ChatMode;

  setActiveRightTool: (tool: ToolId) => void;
  setChatMode: (mode: ChatMode) => void;
}

/**
 * UI 切片创建器
 */
export const createUISlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): UISlice => ({
  activeRightTool: 'files',
  chatMode: "ask",

  setActiveRightTool: (tool) => set({ activeRightTool: tool }),
  setChatMode: (mode) => set({ chatMode: mode })
});
