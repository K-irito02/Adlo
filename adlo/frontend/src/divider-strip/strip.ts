import { invoke } from '@tauri-apps/api/core';

/**
 * 透明桥接条（divider strip）控制面：绘制分隔线并拥有拖拽手势，
 * 通过 `divider_strip_drag` 命令把拖拽增量回传主窗口（几何计算归主窗口所有）。
 *
 * 运行配置由后端经 initialization script 注入 `window.__DIVIDER_STRIP__`
 *（主题色/aria-label/语言），本文件不硬编码任何面向用户的文本与颜色。
 */

interface DividerStripTheme {
  line: string;
  glow: string;
}

interface DividerStripConfig {
  theme: DividerStripTheme;
  ariaLabel: string;
  lang: string;
}

declare global {
  interface Window {
    __DIVIDER_STRIP__?: DividerStripConfig;
  }
}

const FALLBACK_CONFIG: DividerStripConfig = {
  // 与 divider-strip.html :root 及 useDividerStrip.resolveStripTheme  fallback 同值。
  theme: { line: '#c8c8c8', glow: '#888888' },
  ariaLabel: '',
  lang: '',
};

const config = window.__DIVIDER_STRIP__ ?? FALLBACK_CONFIG;

const root = document.documentElement;
root.style.setProperty('--strip-line', config.theme.line);
root.style.setProperty('--strip-glow', config.theme.glow);
if (config.lang) {
  root.lang = config.lang;
}
if (config.ariaLabel) {
  document.title = config.ariaLabel;
}

const strip = document.getElementById('adl-divider-strip');
if (strip) {
  if (config.ariaLabel) {
    strip.setAttribute('aria-label', config.ariaLabel);
  }

  let seq = 0;
  let dragging = false;
  // S3：pointermove 按帧合并上报（累积 dx，每帧至多一次 invoke），
  // start/end 保持即时上报以保证拖拽语义。
  let pendingDx = 0;
  let rafQueued = false;

  const report = (phase: 'start' | 'move' | 'end', dx = 0): void => {
    seq += 1;
    invoke('divider_strip_drag', { seq, phase, dx }).catch(() => {
      /* strip 与主窗口同进程，invoke 失败即后端不可达，无可恢复动作 */
    });
  };

  strip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || dragging) {
      return;
    }
    dragging = true;
    strip.classList.add('is-dragging');
    try {
      strip.setPointerCapture(e.pointerId);
    } catch {
      /* 部分环境不支持 pointer capture，拖拽仍可经 pointermove 继续 */
    }
    report('start');
    e.preventDefault();
  });

  strip.addEventListener('pointermove', (e) => {
    if (!dragging) {
      return;
    }
    pendingDx += e.movementX;
    if (rafQueued) {
      return;
    }
    rafQueued = true;
    requestAnimationFrame(() => {
      rafQueued = false;
      if (!dragging || pendingDx === 0) {
        return;
      }
      report('move', pendingDx);
      pendingDx = 0;
    });
  });

  const finish = (e: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    dragging = false;
    strip.classList.remove('is-dragging');
    try {
      strip.releasePointerCapture(e.pointerId);
    } catch {
      /* 未持有 capture 时释放会抛错，忽略即可 */
    }
    // end 自带尾帧位移：单次 invoke 提交，消除 move/end 乱序丢尾帧（S20）。
    report('end', pendingDx);
    pendingDx = 0;
  };
  strip.addEventListener('pointerup', finish);
  strip.addEventListener('pointercancel', finish);
  // S10：capture 被系统夺走时同样收尾，防 dragging 永久滞留。
  strip.addEventListener('lostpointercapture', finish);
  strip.addEventListener('contextmenu', (e) => e.preventDefault());
}
