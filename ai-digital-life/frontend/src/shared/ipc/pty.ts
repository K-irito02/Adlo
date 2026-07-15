import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

export interface PtySessionInfo {
  sessionId: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  status: 'Running' | 'Terminated';
  output?: string;
}

export interface PtyOutputEvent {
  sessionId: string;
  data: string;
}

/**
 * PTY (伪终端) 会话管理桥接能力
 * 用于: 创建 PTY 会话、发送输入、调整大小、结束会话、列出会话
 * Tauri 命令: pty_* 系列
 * 浏览器模式: 前端本地模拟或预览 API
 */
export interface PtyBridge {
  /**
   * 创建新的 PTY 会话
   * @param input shell 路径、工作目录、终端列数、行数
   * @returns 新建会话的 ID
   * @command pty_create
   * @see tauri-bridge.ts → pty.create
   * @see mock-bridge.ts → pty.create
   * @see preview-bridge/index.ts → pty.create
   */
  create: (input: {
    shell?: string;
    cwd?: string;
    cols: number;
    rows: number;
  }) => Promise<IpcResult<{ sessionId: string }>>;
  /**
   * 向 PTY 会话发送输入
   * @param sessionId PTY 会话 ID
   * @param data 输入数据 (按键/命令)
   * @returns 是否成功发送
   * @command pty_input
   * @see tauri-bridge.ts → pty.input
   * @see mock-bridge.ts → pty.input
   * @see preview-bridge/index.ts → pty.input
   */
  input: (sessionId: string, data: string) => Promise<IpcResult<boolean>>;
  /**
   * 调整 PTY 会话的终端大小
   * @param sessionId PTY 会话 ID
   * @param cols 新的列数
   * @param rows 新的行数
   * @returns 是否成功调整
   * @command pty_resize
   * @see tauri-bridge.ts → pty.resize
   * @see mock-bridge.ts → pty.resize
   * @see preview-bridge/index.ts → pty.resize
   */
  resize: (sessionId: string, cols: number, rows: number) => Promise<IpcResult<boolean>>;
  /**
   * 结束 PTY 会话 (杀掉子进程)
   * @param sessionId PTY 会话 ID
   * @returns 是否成功结束
   * @command pty_kill
   * @see tauri-bridge.ts → pty.kill
   * @see mock-bridge.ts → pty.kill
   * @see preview-bridge/index.ts → pty.kill
   */
  kill: (sessionId: string) => Promise<IpcResult<boolean>>;
  /**
   * 列出当前活跃的 PTY 会话
   * @returns PTY 会话信息列表 (sessionId/shell/cwd/状态等)
   * @command pty_list
   * @see tauri-bridge.ts → pty.list
   * @see mock-bridge.ts → pty.list
   * @see preview-bridge/index.ts → pty.list
   */
  list: () => Promise<IpcResult<PtySessionInfo[]>>;
}
