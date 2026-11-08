import type { IpcResult } from '@adlo/kernel';

export type { IpcResult };

/** 「另存为」请求：字节由调用方准备，壳层只负责弹对话框并写盘。 */
export interface FileSaveRequest {
  /** 对话框预填文件名（含扩展名），用户可改名与改位置。 */
  suggestedName: string;
  /** 待写入字节的 base64 编码（标准字母表 + padding）。 */
  dataBase64: string;
}

/** 「另存为」结果：`path` 为用户确认的绝对路径；取消对话框时为 `undefined`。 */
export interface FileSaveResult {
  path?: string;
}

/**
 * 通用「另存为」壳层能力。
 *
 * 任何域需要"让用户选路径并把字节写到那里"时都走这里（剪贴板另存、书签导出……），
 * 各域自己负责产生字节，壳层只负责对话框与写盘。
 *
 * 浏览器模式没有系统对话框：该能力在纯浏览器下不可用（`NOT_SUPPORTED`），
 * 需要落盘的浏览器侧功能应改用 `Blob` + `<a download>`。
 *
 * @command app_save_file（Tauri）
 * @see tauri-bridge/tauri-file-save.ts
 * @see preview-bridge/preview-file-save.ts（dev 预览服务代弹原生对话框）
 * @see mock/mock-file-save.ts
 */
export interface FileSaveBridge {
  /**
   * 弹出系统「另存为」对话框并写入字节。
   * @param request 预填文件名 + 字节（base64）
   * @returns 落盘路径；取消对话框时 `data.path` 为 `undefined`
   */
  saveToFile: (request: FileSaveRequest) => Promise<IpcResult<FileSaveResult>>;
}
