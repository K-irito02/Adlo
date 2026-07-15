import type { IpcResult, PatchApplicationResult, PatchSet } from '@ai-digital-life/kernel';

export type { IpcResult, PatchApplicationResult, PatchSet };

/**
 * 补丁/Patch 管理桥接能力
 * 用于: 获取 patch 集、决策单个 hunk、应用/回滚 patch
 * Tauri 命令: patch_* 系列
 * 浏览器模式: 前端本地模拟
 */
export interface PatchBridge {
  /**
   * 获取指定 patch 集详情
   * @param patchSetId patch 集 ID
   * @returns patch 集详情或 undefined (未找到)
   * @command patch_get_patch_set
   * @see tauri-bridge.ts → patch.getPatchSet
   * @see mock-bridge.ts → patch.getPatchSet
   * @see preview-bridge/index.ts → patch.getPatchSet
   */
  getPatchSet: (patchSetId: string) => Promise<IpcResult<PatchSet | undefined>>;
  /**
   * 对单个 hunk 做出决策 (accepted/rejected/pending)
   * @param input patchSetId、hunkId、决策状态
   * @returns 更新后的 patch 集
   * @command patch_set_hunk_decision
   * @see tauri-bridge.ts → patch.setHunkDecision
   * @see mock-bridge.ts → patch.setHunkDecision
   * @see preview-bridge/index.ts → patch.setHunkDecision
   */
  setHunkDecision: (input: {
    patchSetId: string;
    hunkId: string;
    decision: 'pending' | 'accepted' | 'rejected';
  }) => Promise<IpcResult<PatchSet>>;
  /**
   * 应用整个 patch 集到工作区文件
   * @param patchSetId patch 集 ID
   * @returns 应用结果 (成功/失败/变更的文件数等)
   * @command patch_apply_patch_set
   * @see tauri-bridge.ts → patch.applyPatchSet
   * @see mock-bridge.ts → patch.applyPatchSet
   * @see preview-bridge/index.ts → patch.applyPatchSet
   */
  applyPatchSet: (patchSetId: string) => Promise<IpcResult<PatchApplicationResult>>;
  /**
   * 回滚已应用的 patch 集
   * @param patchSetId patch 集 ID
   * @returns 回滚后的 patch 集状态
   * @command patch_rollback_patch_set
   * @see tauri-bridge.ts → patch.rollbackPatchSet
   * @see mock-bridge.ts → patch.rollbackPatchSet
   * @see preview-bridge/index.ts → patch.rollbackPatchSet
   */
  rollbackPatchSet: (patchSetId: string) => Promise<IpcResult<PatchSet>>;
}
