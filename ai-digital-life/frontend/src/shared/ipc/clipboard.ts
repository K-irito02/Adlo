import type { ClipboardItem, IpcResult } from '@ai-digital-life/kernel';

export type { ClipboardItem, IpcResult };

/**
 * 系统剪贴板历史桥接能力
 * 用于: 查询最近剪贴板历史、删除单项、清空所有历史
 * 后端路由: GET /clipboard/list / POST /clipboard/remove / POST /clipboard/clear
 */
export interface ClipboardBridge {
  /**
   * 获取最近剪贴板历史
   * @param limit 最多返回条数
   * @returns 剪贴板历史条目列表
   * @command GET /clipboard/list?limit=N
   * @see tauri-bridge/index.ts → clipboard.list
   * @see mock-bridge.ts → clipboard.list
   * @see preview-bridge/index.ts → clipboard.list
   */
  list: (limit?: number) => Promise<IpcResult<ClipboardItem[]>>;
  /**
   * 删除单条剪贴板历史
   * @param id 条目 ID
   * @returns 是否删除成功
   * @command POST /clipboard/remove (body { id })
   * @see tauri-bridge/index.ts → clipboard.remove
   * @see mock-bridge.ts → clipboard.remove
   * @see preview-bridge/index.ts → clipboard.remove
   */
  remove: (id: string) => Promise<IpcResult<boolean>>;
  /**
   * 清空全部剪贴板历史
   * @returns 被清空的条目数量
   * @command POST /clipboard/clear (body {})
   * @see tauri-bridge/index.ts → clipboard.clear
   * @see mock-bridge.ts → clipboard.clear
   * @see preview-bridge/index.ts → clipboard.clear
   */
  clear: () => Promise<IpcResult<number>>;
}
