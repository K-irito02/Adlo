import type { IndexingStatus, IpcResult, RepoMapNode, RetrievalSnapshot } from '@adlo/kernel';

export type { IndexingStatus, IpcResult, RepoMapNode, RetrievalSnapshot };

/**
 * 内容索引与检索桥接能力
 * 用于: 获取检索状态快照、代码仓库映射、重建索引
 * Tauri 命令: retrieval_get_status / retrieval_rebuild_index
 * 浏览器模式: 前端从当前 workspace 的文件列表构建
 */
export interface RetrievalBridge {
  /**
   * 获取当前工作区的检索索引状态
   * @returns 检索状态快照 (含 repoMap 条目等)
   * @command retrieval_get_status
   * @see tauri-bridge.ts → retrieval.getStatus
   * @see mock-bridge.ts → retrieval.getStatus
   * @see preview-bridge/index.ts → retrieval.getStatus
   */
  getStatus: () => Promise<IpcResult<RetrievalSnapshot | undefined>>;
  /**
   * 获取仓库代码结构的树状映射
   * @returns 从 repoMap 条目转换来的树节点数组
   * @command 无独立命令 (调用 retrieval_get_status 并在前端转换)
   * @see tauri-bridge.ts → retrieval.getRepoMap
   * @see mock-bridge.ts → retrieval.getRepoMap
   * @see preview-bridge/index.ts → retrieval.getRepoMap
   */
  getRepoMap: () => Promise<IpcResult<RepoMapNode[]>>;
  /**
   * 触发重建当前工作区的检索索引
   * @returns 是否成功触发索引重建
   * @command retrieval_rebuild_index
   * @see tauri-bridge.ts → retrieval.rebuildIndex
   * @see mock-bridge.ts → retrieval.rebuildIndex
   * @see preview-bridge/index.ts → retrieval.rebuildIndex
   */
  rebuildIndex: () => Promise<IpcResult<boolean>>;
}
