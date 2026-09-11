import type { IpcResult } from '@ai-digital-life/kernel';

/**
 * 终端输出持久化桥接接口
 * 存储/加载/删除终端会话的输出内容，用于应用重启后恢复终端历史
 */
export interface TerminalOutputBridge {
  /** 保存会话输出（UPSERT 语义） */
  save(sessionId: string, output: string): Promise<IpcResult<void>>;
  /** 加载会话输出，不存在返回 null */
  load(sessionId: string): Promise<IpcResult<string | null>>;
  /** 删除会话输出 */
  delete(sessionId: string): Promise<IpcResult<void>>;
}
