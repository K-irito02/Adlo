import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import type { WindowBridge } from '../shared/ipc/window';
import { requestPreviewApi } from '../shared/ipc/preview-api';

type MockWindow = DigitalLifeBridge['window'];

export function createPreviewWindowBridge(mockWindow: MockWindow) {
  return {
    window: {
      ...mockWindow,
      openExternal: async (url: string) => {
        const w = window as { trae?: { openExternal: (url: string) => void } };
        if (w.trae?.openExternal) {
          w.trae.openExternal(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      },
      // 浏览器模式跑在 WebView 外，没有 Tauri shell 能力；由同机的预览服务
      // 代开系统文件管理器，保证与桌面端「点了就打开日志目录」行为一致。
      openPath: (path: string) =>
        requestPreviewApi<boolean>('/system/open-path', {
          method: 'POST',
          body: JSON.stringify({ path }),
        }),
    } satisfies WindowBridge,
  };
}
