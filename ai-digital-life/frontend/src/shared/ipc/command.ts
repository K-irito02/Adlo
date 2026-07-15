import type { CommandRequest, CommandRunResult, IpcResult } from '@ai-digital-life/kernel';

export type { CommandRequest, CommandRunResult, IpcResult };

/**
 * 命令执行桥接能力
 * 用于: 执行系统命令、查询最近执行的命令
 * Tauri 命令: command_run / command_list_recent
 * 浏览器模式: 前端本地模拟
 */
export interface CommandBridge {
  /**
   * 执行系统命令
   * @param input 命令路径、参数数组、是否使用 shell
   * @returns 命令执行结果 (含状态/任务 ID/请求详情)
   * @command command_run
   * @see tauri-bridge.ts → command.run
   * @see mock-bridge.ts → command.run
   * @see preview-bridge/index.ts → command.run
   */
  run: (input: {
    command: string;
    args: string[];
    shell?: boolean;
  }) => Promise<IpcResult<CommandRunResult>>;
  /**
   * 列出最近执行的命令
   * @param limit 返回结果数量上限 (可选)
   * @returns 最近执行的命令请求列表
   * @command command_list_recent
   * @see tauri-bridge.ts → command.listRecent
   * @see mock-bridge.ts → command.listRecent
   * @see preview-bridge/index.ts → command.listRecent
   */
  listRecent: (limit?: number) => Promise<IpcResult<CommandRequest[]>>;
}
