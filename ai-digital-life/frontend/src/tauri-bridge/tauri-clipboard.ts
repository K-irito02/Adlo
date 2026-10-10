import type { ClipboardBridge, ClipboardSaveToFileRequest } from '../shared/ipc/clipboard';
import { invokeIpc } from './tauri-shared';

/**
 * 剪贴板"系统壳层"能力（无 ad-server HTTP 路由的落盘通道）。
 *
 * 数据归属不变：条目字节由前端从 `/clipboard/export` 取回；壳层只提供
 * `tauri-plugin-dialog` 的原生「另存为」并把字节写到用户选定位置
 * —— 与 `createTauriWorkspaceBridge` 的 `pickDirectory` 同一分工。
 */
export function createTauriClipboardBridge(): Pick<ClipboardBridge, 'saveToFile'> {
  return {
    saveToFile: (request: ClipboardSaveToFileRequest) =>
      // Rust 侧返回 `Option<String>`（与 `workspace_pick_directory` 同形态）：
      // 确认保存为绝对路径，取消对话框为 None。此处归一成 `{ path?: string }`。
      invokeIpc<string | null>('clipboard_save_to_file', {
        payload: {
          suggested_name: request.suggestedName,
          data_base64: request.dataBase64,
        },
      }).then((result) =>
        result.ok ? { ok: true as const, data: { path: result.data ?? undefined } } : result,
      ),
  };
}
