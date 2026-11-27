import { createRoot } from 'react-dom/client';
import type { DigitalLifeBridge } from './shared/ipc/digital-life';
import { createTauriBridge, isTauriShell, resolveTauriServerBaseUrl } from './tauri-bridge';
import { registerFlushOnPageHide } from './app/stores/storageHelpers';
import { App } from './app/App';
import './app/utils/debugLogCollector'; // 调试日志收集器
import './styles/index.css';
import './styles/tailwind.css';

async function syncTauriWindowIcon(): Promise<void> {
  if (typeof window === 'undefined' || !isTauriShell()) {
    return;
  }

  try {
    const response = await fetch('/adlo-icon.png', { cache: 'force-cache' });
    if (!response.ok) {
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setIcon(bytes);
  } catch {
    // Best-effort only. Tauri still falls back to bundled icons.
  }
}

/**
 * Task 10 — the desktop shell spawns the ad-server as a child process and the
 * frontend httpBridge must connect to its discovered base URL. The tauri-bridge
 * resolves it via the `app_get_server_info` Tauri command (falls back to the
 * default ad-server address when the engine is not running, e.g. dev).
 */
/** E2E-only build (`vite build --mode e2e`): expose the WDIO Tauri plugin. */
const isE2E = import.meta.env.VITE_ADL_E2E === '1';

async function boot(): Promise<void> {
  if (isE2E) {
    // Must initialize before tests run; requires `withGlobalTauri` (e2e config only).
    await import('@wdio/tauri-plugin');
  }

  if (typeof window !== 'undefined' && !window.digitalLife) {
    if (isTauriShell()) {
      const baseUrl = await resolveTauriServerBaseUrl();
      window.digitalLife = createTauriBridge(baseUrl);
      document.documentElement.dataset.shell = 'tauri';
    } else {
      const { setupPreviewBridge } = await import('./preview-bridge');
      await setupPreviewBridge();
      document.documentElement.dataset.shell = 'browser';
    }
  }

  const container = document.getElementById('app');
  if (!container) {
    throw new Error('App root not found.');
  }
  createRoot(container).render(<App />);
}

void boot();
void syncTauriWindowIcon();
// 关窗兜底：去抖窗口内的 pending 写入在 pagehide / 切后台时同步落盘。
registerFlushOnPageHide();

if (import.meta.env.DEV) {
  void import('./app/utils/freezeProbe').then((probe) => probe.installFreezeProbe());
}

declare global {
  interface Window {
    digitalLife: DigitalLifeBridge;
  }
}
