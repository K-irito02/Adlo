import type { FileSaveBridge, FileSaveRequest } from '../shared/ipc/fileSave';
import { requestPreviewApi } from '../shared/ipc/preview-api';

/**
 * 通用「另存为」的浏览器预览实现。
 *
 * ad-server 没有「另存为」路由，浏览器端也没有系统对话框；dev 预览服务代为弹出
 * 宿主原生对话框（Windows SaveFileDialog / macOS choose file name / Linux zenity），
 * 与桌面端 Tauri 命令行为一致。
 *
 * `requestPreviewApi` 自带 try/catch，失败恒返回结构化 IpcResult，不抛。
 */
export function createPreviewFileSaveBridge(): FileSaveBridge {
  return {
    saveToFile: (request: FileSaveRequest) =>
      requestPreviewApi<{ path?: string }>('/file/save', {
        method: 'POST',
        body: JSON.stringify({
          suggestedName: request.suggestedName,
          dataBase64: request.dataBase64,
        }),
      }),
  };
}
