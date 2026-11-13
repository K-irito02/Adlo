import { useLayoutEffect, useRef } from 'react';
import './StartupOverlay.css';

// 品牌锁定文案（GLOSSARY：产品名并列书写为「Adlo · 安洛」）。
// 开屏在 i18n 字典加载完成前就必须渲染，且该串不随语言切换，故不进 i18n 字典。
const BRAND_LOCKUP = 'Adlo · 安洛'; // cjk-source-allow: 品牌常量，非可本地化 UI 文案

/**
 * 开屏：品牌图标 + 掠光 + 网格背景。
 *
 * 时序（总长 2320ms 演完，3.5s 最短停留由 App.tsx 控制，剩余由网格漂移
 * 与弱掠光填充）：
 *   0–620ms     图标落定（scale 0.96→1，blur 6px→0）
 *   0–900ms     网格自中心生长，随后 9s 周期极慢漂移
 *   560–1460ms  柔光带扫过图标
 *   1420–1940ms 细线由中心展开
 *   1700–2320ms 名称收字距淡入
 *   2600ms+     每 2.6s 一次弱掠光
 *
 * 主题不在此读取 `data-theme`：覆盖层颜色与动画全部由 CSS 变量
 * （themes.css 的 `--splash-*` + tokens.css 的 `--splash-*` 时长）驱动，
 * `prefers-reduced-motion` 下由 CSS 直接呈现静态成品。
 */
export default function StartupOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);

  // 移除 index.html 中的静态预加载覆盖层，让 React 覆盖层接管。
  // 两者底色同值（#preload-overlay 的 #fff/#000 对应 --splash-bg），替换瞬间不闪色。
  useLayoutEffect(() => {
    document.getElementById('preload-overlay')?.remove();
  }, []);

  // dev-only 验证钩子（生产构建由 `import.meta.env.DEV` 静态剔除）：
  //   `?adl-motion=reduce`  强制走 reduced-motion 分支，验证静态成品；
  //   `?adl-splash-at=1500` 把整条时间轴定格在第 1500ms，便于截图与读 computed style
  //   （浏览器窗口不可见时动画时钟会被冻结，这条是唯一能取到中间帧的手段）。
  useLayoutEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('adl-motion') === 'reduce') {
      root.classList.add('adl-splash--reduced');
    }
    const at = Number(params.get('adl-splash-at'));
    if (!Number.isFinite(at) || at < 0 || typeof root.getAnimations !== 'function') {
      return;
    }
    const freeze = () => {
      const animations = root.getAnimations({ subtree: true });
      if (animations.length === 0) {
        return;
      }
      for (const animation of animations) {
        animation.currentTime = at;
        animation.pause();
      }
    };
    freeze();
    // 首帧样式尚未解析时动画列表可能为空，补一帧再试。
    window.requestAnimationFrame(freeze);
  }, []);

  return (
    <div aria-hidden="true" className="adl-splash" ref={rootRef}>
      <div className="adl-splash__grid" />
      <div className="adl-splash__brand">
        <div className="adl-splash__mark">
          <img alt="" height={88} src="/adlo-icon.png" width={88} />
          <span className="adl-splash__sweep" />
          <span className="adl-splash__sweep adl-splash__sweep--idle" />
        </div>
        <div className="adl-splash__rule" />
        <div className="adl-splash__name">{BRAND_LOCKUP}</div>
      </div>
    </div>
  );
}
