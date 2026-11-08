import type { FileSaveBridge, FileSaveRequest } from '../shared/ipc/fileSave';
import { invokeIpc } from './tauri-shared';

/**
 * 通用「另存为」的 Tauri 实现：壳层弹原生对话框并写盘，ad-server 不参与。
 *
 * 返回值形态与 Rust 侧 `Option<String>` 对齐：确认保存为绝对路径，取消对话框为 None。
 */
export function createTauriFileSaveBridge(): FileSaveBridge {
  return {
    saveToFile: (request: FileSaveRequest) =>
      invokeIpc<string | null>('app_save_file', {
        payload: {
          suggested_name: request.suggestedName,
          data_base64: request.dataBase64,
        },
      }).then((result) =>
        result.ok ? { ok: true as const, data: { path: result.data ?? undefined } } : result,
      ),
  };
}
