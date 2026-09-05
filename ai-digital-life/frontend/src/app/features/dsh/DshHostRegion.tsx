import { useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';

/**
 * 中间区 dsh 宿主渲染层。
 * - 浏览器模式：用 `<iframe>` 显示 dsh 进程 URL（悬浮层天然置顶）。
 * - Tauri 桌面：由独立 WebView2 子窗口承载（Task 7 接入），此处渲染占位容器
 *   （原生 WebView 由 `browser_set_tab_bounds` 定位到该容器区域）。
 * 若 iframe 加载被拒或 URL 缺失，退化为"在外部浏览器打开"按钮。
 */
export function DshHostRegion() {
  const { t } = useTCopy();
  const url = useAppStore((s) => s.url);
  const isTauri = useMemo(() => isTauriShell(), []);

  if (!url) {
    return (
      <section className="adl-center adl-center--dsh-placeholder">
        <div className="adl-center__body adl-center__body--empty">
          <div className="adl-center__empty">{t.dshWelcomeEmpty}</div>
        </div>
      </section>
    );
  }

  // Tauri 桌面：WebView2 子窗口由 Task 7 承载到这个 .dsh-host-region 容器，
  // 前端不渲染 iframe。容器保持存在以提供 WebView 定位锚点。
  if (isTauri) {
    return <section className="dsh-host-region" data-shell="tauri" aria-label={t.dshTitle} />;
  }

  return (
    <section className="dsh-host-region" data-shell="browser" aria-label={t.dshTitle}>
      <iframe src={url} title={t.dshTitle} className="dsh-host-region__frame" />
    </section>
  );
}