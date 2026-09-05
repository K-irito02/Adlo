import React from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { useAppStore } from '../stores/slicedStore';
import { DshHostRegion } from '../features/dsh/DshHostRegion';
import { WelcomePage } from '../features/dsh/WelcomePage';
import { CloseDshDialog } from '../features/dsh/CloseDshDialog';

/**
 * 中部主区域 — dsh 宿主壳承载区。
 *
 * dsh 打开时由 `DshHostRegion` 渲染（浏览器 iframe / Tauri WebView）。
 * 关闭时由 `WelcomePage` 显示欢迎引导页 + 版本管理。
 * 关闭动作由 `CloseDshDialog`（保留进程 / 彻底退出）承载。
 */
const CenterPane = React.memo(function CenterPane() {
  const { t } = useTCopy();
  const isDshOpen = useAppStore((s) => s.isOpen);

  return (
    <section className="adl-center adl-center--dsh-placeholder" aria-label={t.dshTitle}>
      <CloseDshDialog />
      {isDshOpen ? <DshHostRegion /> : <WelcomePage />}
    </section>
  );
});

export { CenterPane };
