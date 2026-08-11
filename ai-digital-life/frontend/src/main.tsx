import { createRoot } from 'react-dom/client';
import type { DigitalLifeBridge } from './shared/ipc/digital-life';
import { setupPreviewBridge } from './preview-bridge';
import { createTauriBridge, isTauriShell, resolveTauriServerBaseUrl } from './tauri-bridge';
import { App } from './app/App';
import './app/utils/debugLogCollector'; // 调试日志收集器
import './styles/index.css';
import './styles/tailwind.css';

async function syncTauriWindowIcon(): Promise<void> {
  if (typeof window === 'undefined' || !isTauriShell()) {
    return;
  }

  try {
    const response = await fetch('/logo-chatgpt.png', { cache: 'force-cache' });
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
async function boot(): Promise<void> {
  if (typeof window !== 'undefined' && !window.digitalLife) {
    if (isTauriShell()) {
      const baseUrl = await resolveTauriServerBaseUrl();
      window.digitalLife = createTauriBridge(baseUrl);
      document.documentElement.dataset.shell = 'tauri';
    } else {
      setupPreviewBridge();
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

declare global {
  interface Window {
    digitalLife: DigitalLifeBridge;
  }
}
