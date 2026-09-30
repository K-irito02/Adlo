// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { findRuleGroups } from './testing/cssRules';

/**
 * 「中心区宿主 WebView ↔ 右侧面板」分隔线命中带的常驻 DOM 沟槽契约。
 *
 * 回归对象（2026-09-30 实测）：dsh WebView2 打开且浏览器侧边栏收起时，
 * 两个 OS 级 WebView2 子窗口贴边相邻，`.adl-rightpanel__resize-handle` 的
 * 14px 命中带被子窗口覆盖（WebView2 为 OS 级渲染表面，鼠标命中测试落在子窗口，
 * 主窗口 DOM 收不到事件，`z-index` 无效），分隔线几乎无法按下拖拽。
 *
 * 修复：常驻 DOM 沟槽（方案 1）—— `.adl-app-host` 右缘内缩 8px、
 * `.adl-tool-primary--browser` 左缘内缩 6px，两 WebView 的 bounds 经
 * `getBoundingClientRect` 镜像自动跟随，命中带全程落在主窗口 DOM 上。
 *
 * 断言方式：几何契约而非字面量钉死——按各 CSS 声明值推算命中带（border-box 坐标，
 * 手柄 `left` 相对面板 padding box，需加 border-left 宽度换算）与两侧沟槽宽度，
 * 保证「沟槽 ⊇ 命中带」；调宽手柄或收窄沟槽任一侧都会被拦截。
 */
function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
}

/** 选择器整段匹配的规则体（含组合选择器），并剥掉体内注释。 */
function ruleBodies(css: string, selector: string): string[] {
  return findRuleGroups(css, selector)
    .filter((block) =>
      block
        .slice(0, block.indexOf('{'))
        .trim()
        .split(/[\s>+~]+/)
        .includes(selector),
    )
    .map((block) =>
      block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')).replace(/\/\*[\s\S]*?\*\//g, ''),
    );
}

/** 级联后最后一个声明值（同属性多条声明时后者胜出）。 */
function lastDeclaration(css: string, selector: string, property: string): string | null {
  const pattern = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;]+);`, 'g');
  const values = ruleBodies(css, selector).flatMap((body) => {
    const found: string[] = [];
    for (const match of body.matchAll(pattern)) {
      found.push(match[1].trim());
    }
    return found;
  });
  return values.length > 0 ? values[values.length - 1] : null;
}

/** 解析形如 `8px` 的长度声明（不接受 0 / 关键字 / 表达式）。 */
function pxValue(css: string, selector: string, property: string): number {
  const raw = lastDeclaration(css, selector, property);
  expect(raw, `${selector} 缺少 ${property} 声明`).toBeTruthy();
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(raw!);
  expect(match, `${selector} 的 ${property} 应为像素长度，实际: ${raw}`).toBeTruthy();
  return parseFloat(match![1]);
}

/** `border-left: 1px solid …` → 宽度；缺省视作 0。 */
function borderWidthPx(css: string, selector: string, side: 'left' | 'right'): number {
  const raw = lastDeclaration(css, selector, `border-${side}`);
  if (!raw) {
    return 0;
  }
  const match = /^(\d+(?:\.\d+)?)px\b/.exec(raw.trim());
  return match ? parseFloat(match[1]) : 0;
}

const rightPanelCss = readRepoFile('./regions/rightpanel/files-panel-core.css');
const dshCss = readRepoFile('./regions/dsh.css');
const browserWebviewCss = readRepoFile('./regions/rightpanel/browser-webview.css');

const HANDLE = '.adl-rightpanel__resize-handle';
const PANEL = '.adl-rightpanel';
const DSH_HOST = '.adl-app-host';
const BROWSER_PRIMARY = '.adl-tool-primary--browser';

describe('divider gutter — dsh WebView ↔ 右侧面板分隔线命中带', () => {
  const escape = -pxValue(rightPanelCss, HANDLE, 'left');
  const handleWidth = pxValue(rightPanelCss, HANDLE, 'width');
  const borderWidth = borderWidthPx(rightPanelCss, PANEL, 'left');
  // 手柄 left 相对 padding box：换算到面板 border-box（x=0 = 面板左缘 = 中心区右缘）
  const bandLeft = borderWidth - escape;
  const bandRight = bandLeft + handleWidth;

  it('手柄命中带跨越面板边界（区域逃逸设计意图保持）', () => {
    expect(escape).toBeGreaterThan(0);
    expect(bandLeft).toBeLessThan(0);
    expect(bandRight).toBeGreaterThan(0);
  });

  it('中心侧沟槽（.adl-app-host 右缘内缩）完整覆盖命中带左半', () => {
    const centerGutter = pxValue(dshCss, DSH_HOST, 'right');
    expect(centerGutter).toBeGreaterThanOrEqual(-bandLeft);
  });

  it('面板侧沟槽（border-left + 浏览器主容器左 margin）完整覆盖命中带右半', () => {
    const panelMargin = pxValue(browserWebviewCss, BROWSER_PRIMARY, 'margin-left');
    const panelGutter = borderWidth + panelMargin;
    expect(panelGutter).toBeGreaterThanOrEqual(bandRight);
  });

  it('两侧沟槽均为正宽度（缝真实存在，而非仅靠 border 兜底）', () => {
    expect(pxValue(dshCss, DSH_HOST, 'right')).toBeGreaterThan(0);
    expect(pxValue(browserWebviewCss, BROWSER_PRIMARY, 'margin-left')).toBeGreaterThan(0);
  });
});
