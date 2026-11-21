import { ExternalLinkError } from './ExternalLinkError';
import { OrbitalLoader } from '@components/OrbitalLoader';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { CopyDict } from '@i18n/types';

export interface BrowserIframeErrorOverlayProps {
  t: CopyDict;
  activeTab: BrowserTabState | undefined;
  loadingTabId: string | null;
  iframeBlockedDetected: boolean;
  iframeLoadError: boolean;
  isEmbedPending: boolean;
}

/**
 * iframe 错误/加载态覆盖层。
 *
 * 渲染优先级：
 * 1. 无 activeTab.url → null
 * 2. 正在加载（loadingTabId === activeTab.id）→ OrbitalLoader
 * 3. 否则按状态渲染嵌入阻断 / 连接失败 / Embed pending 三类提示
 *
 * Tauri 模式下持续渲染；浏览器模式仅在嵌入预检被拒或 iframe 加载失败时渲染
 * （否则会与 ErrorBoundary 的正常 iframe 渲染重叠）。
 */
export function BrowserIframeErrorOverlay({
  t,
  activeTab,
  loadingTabId,
  iframeBlockedDetected,
  iframeLoadError,
  isEmbedPending,
}: BrowserIframeErrorOverlayProps) {
  if (!activeTab?.url) {
    return null;
  }
  if (loadingTabId === activeTab.id) {
    return <OrbitalLoader />;
  }
  return (
    <>
      {iframeBlockedDetected && (
        <ExternalLinkError
          errorKey="browserCannotOpenEmbedded"
          activeTabUrl={activeTab?.url}
          t={t}
          variant="blocked"
        />
      )}
      {iframeLoadError && !iframeBlockedDetected && (
        <ExternalLinkError
          errorKey="browserConnectionFailed"
          activeTabUrl={activeTab?.url}
          t={t}
          variant="blocked"
        />
      )}
      {isEmbedPending && (
        <div className="adl-browser-loading">
          <div className="adl-browser-loading__spinner" />
        </div>
      )}
    </>
  );
}
