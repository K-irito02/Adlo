// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const settingsCss = readFileSync(new URL('./components/settings.css', import.meta.url), 'utf-8');
const composerCoreCss = readFileSync(
  new URL('./regions/composer-core.css', import.meta.url),
  'utf-8',
);
const hintCardCss = readFileSync(new URL('./components/hintCard.css', import.meta.url), 'utf-8');
const revealCss = readFileSync(
  new URL('./components/reveal-scrollbar.css', import.meta.url),
  'utf-8',
);
const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf-8');
const editorCss = readFileSync(
  new URL('./regions/rightpanel/cm-overrides.css', import.meta.url),
  'utf-8',
);

function ruleBody(css: string, selector: string): string | null {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return null;
  }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/** 分组（逗号并列）选择器规则的规则体查找：selector 需作为选择器列表中的完整一项（后随 `{` 或 `,`）。
 * 用于 workspace/storage 头块合并后共享选择器的断言。 */
function groupRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|,\\s*)${escaped}(?=\\s*(?:,|\\{))`, 'm');
  const m = re.exec(css);
  if (!m) {
    return null;
  }
  const open = css.indexOf('{', m.index);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('workspace settings styles (narrow input + right angles + merged-card cleanup)', () => {
  it('provides a narrow modifier for the numeric input', () => {
    const body = ruleBody(settingsCss, '.adl-settings-input--narrow');
    expect(body).not.toBeNull();
    const widthMatch = /width:\s*(\d+)px/.exec(body!);
    expect(widthMatch).not.toBeNull();
    expect(Number(widthMatch![1])).toBeLessThan(200);
  });

  it('keeps settings inputs right-angled with --radius-sm', () => {
    const body = ruleBody(settingsCss, '.adl-settings-input');
    expect(body).not.toBeNull();
    expect(body).toContain('var(--radius-sm)');
  });

  it('makes workspace tags and the empty drop zone right-angled', () => {
    const item = ruleBody(settingsCss, '.adl-sortable-item');
    const empty = ruleBody(settingsCss, '.adl-sortable-empty');
    expect(item).not.toBeNull();
    expect(empty).not.toBeNull();
    expect(item).toContain('var(--radius-sm)');
    expect(empty).toContain('var(--radius-sm)');
    expect(item).not.toContain('var(--radius-md)');
    expect(empty).not.toContain('var(--radius-md)');
  });

  it('drops dead grid-card rules after the four blocks merged into one', () => {
    expect(settingsCss).not.toContain('.workspace-grid--cards');
    expect(settingsCss).not.toContain('.adl-settings-card--grid');
  });

  it('drops the in-card h4 subtitle rule after immovables moved to a block header', () => {
    // 精确选择器断言（与文件内 ruleBody 风格统一），避免子串误杀 `--foo` 后缀类名；
    // 同时用 groupRuleBody 覆盖"以逗号分组形式被重新引入"的盲点（rev2 I3-N1）。
    expect(ruleBody(settingsCss, '.adl-settings-section-title')).toBeNull();
    expect(groupRuleBody(settingsCss, '.adl-settings-section-title')).toBeNull();
  });

  it('workspace block header drops the divider and heavy spacing to the card', () => {
    // 头块选择器已与 storage 头块合并为逗号并列组，用 groupRuleBody 查找。
    const header = groupRuleBody(settingsCss, '.adl-settings-workspace__header');
    expect(header).not.toBeNull();
    expect(header).not.toContain('border-bottom');
    expect(header).not.toContain('padding-bottom');
    // 真正的分隔线在内层 SettingsHeader 上（外层容器本就没有）
    const inner = groupRuleBody(
      settingsCss,
      '.adl-settings-workspace__header .adl-settings-header',
    );
    expect(inner).not.toBeNull();
    expect(inner).toContain('border-bottom: none');
    expect(inner).toContain('padding-bottom: 0');
  });

  it('tightens the gap between the workspace title block and the card', () => {
    const body = groupRuleBody(settingsCss, '.adl-settings-section.adl-settings-workspace');
    expect(body).not.toBeNull();
    expect(body).toContain('gap: var(--space-3)');
  });

  it('drops the divider between the max-concurrent row and the lists', () => {
    const body = ruleBody(
      settingsCss,
      '.adl-settings-workspace .adl-settings-card > .adl-settings-row--flush',
    );
    expect(body).not.toBeNull();
    expect(body).toContain('border-bottom: none');
  });

  it('keeps grid columns from blowing out on long workspace names', () => {
    const body = ruleBody(settingsCss, '.workspace-grid > .adl-sortable-section');
    expect(body).not.toBeNull();
    expect(body).toContain('min-width: 0');
  });

  it('matches the empty drop zone box to a real workspace item', () => {
    const empty = ruleBody(settingsCss, '.adl-sortable-empty');
    const item = ruleBody(settingsCss, '.adl-sortable-item');
    expect(empty).not.toBeNull();
    expect(item).not.toBeNull();
    const paddingOf = (s: string) =>
      /padding:\s*([^;]+);/.exec(s)?.[1]?.replace(/\s+/g, ' ').trim();
    expect(paddingOf(empty!)).toBe(paddingOf(item!));
    expect(empty).toContain('font-size: var(--text-sm)');
  });

  it('provides a titled section style for hint cards', () => {
    const title = ruleBody(hintCardCss, '.hint-card__title');
    expect(title).not.toBeNull();
    expect(title).toContain('font-weight');
    expect(hintCardCss).toContain('.hint-card__title:first-child');
    expect(hintCardCss).toContain('.hint-card__title + .hint-card__line');
  });

  it('keeps settings nav hover on the light surface token', () => {
    const hover = ruleBody(settingsCss, '.adl-settings-nav__row:hover');
    expect(hover).not.toBeNull();
    expect(hover).toContain('background: var(--surface-hover)');
  });

  it('paints a selected settings nav row deeper than hover (file-tree bg-active)', () => {
    const active = groupRuleBody(settingsCss, '.adl-settings-nav__row.is-active');
    expect(active).not.toBeNull();
    expect(active).toContain('background: var(--bg-active)');
    expect(active).not.toContain('pastel-neutral-bg');
  });

  it('keeps a selected settings nav row deep while hovered', () => {
    const activeHover = ruleBody(settingsCss, '.adl-settings-nav__row.is-active:hover');
    expect(activeHover).not.toBeNull();
    expect(activeHover).toContain('background: var(--bg-active)');
  });

  it('matches a selected nav item to the row and keeps its bold label', () => {
    const item = ruleBody(settingsCss, '.adl-settings-nav__item.is-active');
    expect(item).not.toBeNull();
    expect(item).toContain('font-weight: var(--font-semibold)');
    // 背景由 row.is-active 控制，item 层不设——防止 bg-active 透明叠色
    expect(item).not.toContain('background');
  });

  it('composes list hints with a shared intro title and single-newline sections', () => {
    const src = readFileSync(
      new URL('../app/features/workspace-settings/WorkspaceSettings.tsx', import.meta.url),
      'utf-8',
    );
    expect(src).toContain('listHintIntroTitle');
    expect(src).not.toContain('\\n\\n${t.');
  });

  it('lays out tree-cache stats as a horizontal flex line with separators', () => {
    const stats = ruleBody(settingsCss, '.adl-tree-cache-stats');
    expect(stats).not.toBeNull();
    expect(stats).toContain('display: flex');
    expect(stats).toContain('flex-wrap: wrap');
    const sep = ruleBody(settingsCss, '.adl-tree-cache-stats__sep');
    expect(sep).not.toBeNull();
  });

  it('adds extra top margin to the tree-cache block header vs the core-paths header', () => {
    const header = groupRuleBody(settingsCss, '.adl-settings-storage__header--tree-cache');
    expect(header).not.toBeNull();
    expect(header).toContain('margin-top');
    const base = ruleBody(settingsCss, '.adl-settings-storage__header');
    expect(base).not.toBeNull();
    expect(base).not.toContain('margin-top');
  });

  it('adds extra top margin to stacked section block headers like tree-cache', () => {
    const header = groupRuleBody(settingsCss, '.adl-settings-storage__header--section');
    expect(header).not.toBeNull();
    expect(header).toContain('margin-top');
  });

  it('styles the browser group block headers like storage (base + section + container)', () => {
    // 挂起块头（首块）与 storage/workspace 共用同一规则（storage 保持组内末位，
    // ruleBody 精确匹配 `.adl-settings-storage__header {` 不被破坏；
    // DSH 头块后续并入同一组，同样保持 storage 末位）。
    const base = groupRuleBody(settingsCss, '.adl-settings-browser__header');
    expect(base).not.toBeNull();
    expect(base).toContain('display: flex');
    // 下载设置块头带 --section 修饰，与存储分段块头同享额外上边距。
    const section = groupRuleBody(settingsCss, '.adl-settings-browser__header--section');
    expect(section).not.toBeNull();
    expect(section).toContain('margin-top');
    // section 容器 gap 与 workspace/storage 共享。
    const container = groupRuleBody(settingsCss, '.adl-settings-section.adl-settings-browser');
    expect(container).not.toBeNull();
    expect(container).toContain('gap: var(--space-3)');
    // 内层 SettingsHeader 的分隔线清零组同样含 browser。
    const inner = groupRuleBody(settingsCss, '.adl-settings-browser__header .adl-settings-header');
    expect(inner).not.toBeNull();
    expect(inner).toContain('border-bottom: none');
  });

  it('styles label-based subtitles exactly like span subtitles', () => {
    // 「更改路径时自动迁移文件」「启用树缓存」用 <label>（点文字即切换，便于无障碍），
    // 视觉必须与其它 <span> 副标题一致：此前选择器只覆盖 span 导致字体走样。
    const body = groupRuleBody(
      settingsCss,
      '.adl-settings-row__label > .adl-settings-row__label-text label',
    );
    expect(body).not.toBeNull();
    expect(body).toContain('font-size: var(--text-sm)');
    expect(body).toContain('font-weight: var(--font-medium)');
    expect(body).toContain('color: var(--text-primary)');
  });

  it('provides a compact row modifier that tightens the grouped second row', () => {
    const body = ruleBody(settingsCss, '.adl-settings-row--compact');
    expect(body).not.toBeNull();
    expect(body).toContain('padding-top');
    expect(body).not.toContain('padding-top: var(--space-3-5)');
  });

  it('paints storage radio/checkbox with monochrome text-primary, not accent blue', () => {
    for (const selector of [
      ".adl-storage-settings input[type='radio']",
      ".adl-storage-settings input[type='checkbox']",
      // 共享 DownloadPathBlock 在浏览器组复用：同一样式缺了浏览器作用域，
      // 迁移复选框回退 UA 默认蓝色（与存储组不一致）。浏览器组暂无原生
      // radio，只断言 checkbox。
      ".adl-settings-browser input[type='checkbox']",
    ]) {
      const body = groupRuleBody(settingsCss, selector);
      expect(body, selector).not.toBeNull();
      expect(body).toContain('accent-color: var(--text-primary)');
      expect(body).not.toContain('var(--accent)');
    }
  });

  it('centers browser suspend/mode row controls vertically against the taller label', () => {
    // 两块卡片（挂起时长 / 下载设置）都带 .adl-browser-settings：label 侧副标题+描述
    // 更高时，右侧控件（数值输入/下拉）应在行内垂直居中，而非全局 flex-start 顶部对齐。
    const body = ruleBody(settingsCss, '.adl-browser-settings .adl-settings-row');
    expect(body).not.toBeNull();
    expect(body).toContain('align-items: center');
  });

  it('makes the clear-cache button right-angled with hover-only outline', () => {
    const body = ruleBody(settingsCss, '.adl-settings-row .adl-btn--path-pick');
    expect(body).not.toBeNull();
    expect(body).toContain('border: 1px solid transparent');
    expect(body).toContain('border-radius: var(--radius-sm)');
    expect(body).toContain('background: var(--bg-muted)');
    const hover = ruleBody(
      settingsCss,
      '.adl-settings-row .adl-btn--path-pick:hover:not(:disabled)',
    );
    expect(hover).not.toBeNull();
    expect(hover).toContain('border-color: var(--border-strong)');
    // 键盘焦点可见（hover 描边不常驻，需独立 focus-visible 规则）。
    const focus = ruleBody(settingsCss, '.adl-settings-row .adl-btn--path-pick:focus-visible');
    expect(focus).not.toBeNull();
    expect(focus).toContain('border-color: var(--border-strong)');
  });
});

describe('settings panel narrow layout (方案 C+B+A)', () => {
  it('B: nav width is clamped against the content floor (360 > 320 constant conflict)', () => {
    // 直接断言钳制式（ruleBody('.adl-settings-nav') 会先命中 is-navigator-collapsed
    // 规则里的同名子串，不能用）。
    expect(settingsCss).toContain(
      'min(var(--adl-settings-nav-width, 160px), calc(100% - var(--adl-settings-content-min, 280px)))',
    );
    // 单一来源：地板变量定义在面板根上；280 = 堆叠舒适最小宽（160 时代与导航
    // 下限同源耦合，兜底横滚在数学上不可达）。
    const panel = ruleBody(settingsCss, '.adl-settings-panel');
    expect(panel).not.toBeNull();
    expect(panel).toContain('--adl-settings-content-min: 280px');
  });

  it('A: content keeps a min-width floor and the host is the horizontal scroller', () => {
    const content = ruleBody(settingsCss, '.adl-settings-panel__content');
    expect(content).not.toBeNull();
    expect(content).toContain('min-width: var(--adl-settings-content-min, 280px)');
    const host = ruleBody(settingsCss, '.adl-settings-panel__content-host');
    expect(host).not.toBeNull();
    expect(host).toContain('overflow-x: auto');
    // 外层是滚动条定位宿主：自身必须不滚动，否则 abspos 滑块随滚动位移。
    const outer = ruleBody(settingsCss, '.adl-settings-panel__content-outer');
    expect(outer).not.toBeNull();
    expect(outer).toContain('position: relative');
    expect(outer).not.toContain('overflow-x');
  });

  it('C: content-host is the container-query context', () => {
    const host = ruleBody(settingsCss, '.adl-settings-panel__content-host');
    expect(host).not.toBeNull();
    expect(host).toContain('container-type: inline-size');
    expect(host).toContain('container-name: settings-content');
  });

  it('C: rows stack below 600px instead of crushing the label to zero width', () => {
    const start = settingsCss.indexOf('@container settings-content (max-width: 600px)');
    expect(start).not.toBe(-1);
    // 截到下一个 @container 档为止（固定字符窗口会越界吞到后续档，rev2 R2）。
    const nextStage = settingsCss.indexOf('@container', start + 1);
    const block = settingsCss.slice(start, nextStage === -1 ? undefined : nextStage);
    // 堆叠（label 上、control 下）+ 控件流式宽度是两个症状的直接解。
    expect(block).toContain('flex-direction: column');
    expect(block).toContain('width: 100%');
    // 组级 align-items:center（0-2-0）必须在本档被扳回 stretch，否则窄档
    // 子项 shrink-to-fit、四组行为不一致。
    expect(block).toContain('.adl-settings-controls .adl-settings-row');
    expect(block).toContain('align-items: stretch');
    // 字体块整块改列（预览/下拉各占一行）。
    expect(block).toContain('.adl-settings-font--row');
  });

  it('clamps label descriptions to at most 5 lines with anywhere-wrap', () => {
    const body = ruleBody(settingsCss, '.adl-settings-row__label small');
    expect(body).not.toBeNull();
    expect(body).toContain('-webkit-line-clamp: 5');
    expect(body).toContain('overflow-wrap: anywhere');
  });

  it('workspace empty drop-zone text is single-line ellipsized like the tag label', () => {
    const body = ruleBody(settingsCss, '.adl-sortable-empty');
    expect(body).not.toBeNull();
    expect(body).toContain('white-space: nowrap');
    expect(body).toContain('text-overflow: ellipsis');
    expect(body).toContain('overflow: hidden');
  });

  it('nav reset icon shows/hides instantly — no fade transition (ghost-icon regression lock)', () => {
    const body = ruleBody(settingsCss, '.adl-settings-nav__reset');
    expect(body).not.toBeNull();
    // 锁的是真凶（opacity/visibility 过渡），而非一切 transition：
    // 颜色过渡（transition-property: color…）允许且期望保留。
    // 先剥注释：注释里会提到 opacity/visibility 字样，不能计入匹配。
    const code = body!.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/transition[^;]*(opacity|visibility)/);
    expect(body).toContain('visibility: hidden');
    // 修复隐式前提锁：同元素仍挂着基类 `transition: var(--transition-colors)`，
    // 残影不回归依赖该 token 不含 opacity（rev2 R1）。
    const start = tokensCss.indexOf('--transition-colors:');
    expect(start).not.toBe(-1);
    const decl = tokensCss.slice(start, tokensCss.indexOf(';', start));
    expect(decl).toContain('color');
    expect(decl).not.toContain('opacity');
  });

  it('settings cards render instantly — no enter animation remains (drawer-spring regression lock)', () => {
    // 作用域收窄到 card-enter：裸 `@keyframes` 断言会误杀未来合法动效（复审 F2）。
    expect(settingsCss).not.toContain('adl-settings-card-enter');
    expect(settingsCss).not.toMatch(/@keyframes\s+adl-settings-card-enter/);
  });

  it('nav reset disabled state stays dimmed under row hover (show rule specificity fix)', () => {
    expect(settingsCss).toContain('.adl-settings-nav__row:hover .adl-settings-nav__reset:disabled');
    // 选择器列表被 prettier 折成多行，用 groupRuleBody（按逗号分隔项匹配）。
    const body = groupRuleBody(
      settingsCss,
      '.adl-settings-nav__row:hover .adl-settings-nav__reset:disabled',
    );
    expect(body).not.toBeNull();
    expect(body).toContain('opacity: 0.5');
  });

  it('label text ellipsis lives on the flex child span, not the inline-flex container', () => {
    // text-overflow 对 inline-flex 容器无效；子项必须 min-width:0 + overflow 才会出省略号。
    const body = groupRuleBody(
      settingsCss,
      '.adl-settings-row__label > .adl-settings-row__label-text span',
    );
    expect(body).not.toBeNull();
    expect(body).toContain('min-width: 0');
    expect(body).toContain('overflow: hidden');
    expect(body).toContain('text-overflow: ellipsis');
  });

  it('horizontal dot bar releases the sticky dirtybar click band via :has', () => {
    expect(settingsCss).toContain(
      '.adl-settings-panel__content-outer:has(.adl-hscroll) .adl-storage-settings__dirtybar',
    );
    const body = ruleBody(
      settingsCss,
      '.adl-settings-panel__content-outer:has(.adl-hscroll) .adl-storage-settings__dirtybar',
    );
    expect(body).not.toBeNull();
    expect(body).toContain('bottom: 10px');
  });

  it('content x-axis may chain wheel to the host horizontal bar', () => {
    const body = ruleBody(settingsCss, '.adl-settings-panel__content.adl-reveal-scroll');
    expect(body).not.toBeNull();
    expect(body).toContain('overscroll-behavior-x: auto');
  });

  it('workspace grid drops to 2 columns below 320px host (3-col needs inner 264px)', () => {
    expect(settingsCss).toContain('@container settings-content (max-width: 320px)');
    // ≤300 档不再承担降列（原 300 阈值在 host 301~319 会漏裁第三列）：
    // 截取 ≤300 档自身（到下一档 @container 320 为止），避免窗口越界误吞。
    const start300 = settingsCss.indexOf('@container settings-content (max-width: 300px)');
    const start320 = settingsCss.indexOf('@container settings-content (max-width: 320px)');
    expect(start300).not.toBe(-1);
    expect(start320).toBeGreaterThan(start300);
    const block300 = settingsCss.slice(start300, start320);
    expect(block300).not.toContain('.workspace-grid');
    expect(block300).toContain('.adl-settings-keybinds__toolbar');
  });

  it('C: narrow stages tighten padding and unlock fixed-width controls', () => {
    expect(settingsCss).toContain('@container settings-content (max-width: 460px)');
    const start = settingsCss.indexOf('@container settings-content (max-width: 300px)');
    expect(start).not.toBe(-1);
    // 截到下一档边界（与 ≤600/≤320 同法，固定字符窗口会越界，rev3 L1）。
    const nextStage = settingsCss.indexOf('@container', start + 1);
    const block = settingsCss.slice(start, nextStage === -1 ? undefined : nextStage);
    // dsh 锁死的 160px 下拉/测试按钮在极窄档解锁（提权选择器防 dsh-version.css 反覆盖）。
    expect(block).toContain(
      '.adl-settings-panel__content .adl-dsh-settings .adl-settings-dropdown',
    );
    expect(block).toContain('min-width: 0');
  });

  it('reveal scrollbar: horizontal container hides the native bar (custom hbar only)', () => {
    const body = ruleBody(revealCss, '.adl-reveal-scroll-x');
    expect(body).not.toBeNull();
    expect(body).toContain('overflow-x: auto');
    expect(body).toContain('scrollbar-width: none');
    expect(ruleBody(revealCss, '.adl-reveal-scroll-x::-webkit-scrollbar')).toContain(
      'display: none',
    );
  });

  it('dead horizontal reveal axis styles stay removed (superseded by HScrollbar)', () => {
    // 横向 reveal 轴样式已随 settings 改用点态 HScrollbar 删除（无生产消费者）；
    // 横向滚动条的唯一实现是 .adl-hscroll（见下一条断言）。
    expect(revealCss).not.toContain("[data-axis='horizontal']");
  });

  it('HScrollbar: persistent dot-indicator design matches the editor .adl-cm-hscroll', () => {
    // 常驻容器：底部 overlay（无 hover 显现门控 —— 组件按 scrollable 条件渲染）。
    const bar = ruleBody(revealCss, '.adl-hscroll');
    expect(bar).not.toBeNull();
    expect(bar).toContain('bottom: 0');
    expect(bar).toContain('height: 10px');
    // 静止点态：6px 圆点 + 反主题高亮 token + 点位对齐变量（浅色纯黑/深色纯白）。
    const thumb = ruleBody(revealCss, '.adl-hscroll__thumb');
    expect(thumb).not.toBeNull();
    expect(thumb).toContain('min-width: 6px');
    expect(thumb).toContain('max-width: 6px');
    expect(thumb).toContain('var(--hscroll-thumb-bg)');
    expect(thumb).toContain('var(--adl-hscroll-dot-offset');
    // 悬停展开为常规滑块，亮度略亮（hover token）。
    const hover = ruleBody(revealCss, '.adl-hscroll:hover .adl-hscroll__thumb');
    expect(hover).not.toBeNull();
    expect(hover).toContain('min-width: 40px');
    expect(hover).toContain('transform: none');
    expect(hover).toContain('var(--hscroll-thumb-hover-bg)');
    // 拖拽态独立配色。
    const dragging = ruleBody(revealCss, '.adl-hscroll__thumb.is-dragging');
    expect(dragging).not.toBeNull();
    expect(dragging).toContain('var(--hscroll-thumb-dragging-bg)');
  });

  it('HScrollbar dot design stays in parity with editor .adl-cm-hscroll (drift lock, rev2 R5)', () => {
    const cm = ruleBody(editorCss, '.adl-cm-hscroll__thumb');
    const mine = ruleBody(revealCss, '.adl-hscroll__thumb');
    expect(cm).not.toBeNull();
    expect(mine).not.toBeNull();
    // 提取自编辑器的关键视觉参数：任一侧改动都应触发人工同步评估。
    for (const decl of ['min-width: 6px', 'max-width: 6px', 'var(--hscroll-thumb-bg)']) {
      expect(cm).toContain(decl);
      expect(mine).toContain(decl);
    }
    // hover 展开参数双边一致（40px 起、hover 配色）。
    const cmHover = ruleBody(editorCss, '.adl-cm-hscroll:hover .adl-cm-hscroll__thumb');
    const myHover = ruleBody(revealCss, '.adl-hscroll:hover .adl-hscroll__thumb');
    expect(cmHover).not.toBeNull();
    expect(myHover).not.toBeNull();
    for (const decl of ['min-width: 40px', 'var(--hscroll-thumb-hover-bg)']) {
      expect(cmHover).toContain(decl);
      expect(myHover).toContain(decl);
    }
    // 点态触屏手势保护仅提取侧有（编辑器真源无，属合理改进，单边断言）。
    expect(mine).toContain('touch-action: none');
  });
});

describe('storage group reset dialog + dirty bar styles (2026-09-27 decisions)', () => {
  const contextMenuCss = readFileSync(
    new URL('./regions/context-menu.css', import.meta.url),
    'utf-8',
  );

  it('sticky dirty bar uses the straighter radius-sm instead of radius-md (item 4)', () => {
    const body = ruleBody(settingsCss, '.adl-storage-settings__dirtybar');
    expect(body).not.toBeNull();
    expect(body).toContain('border-radius: var(--radius-sm)');
    // 仅断言 border-radius 声明本身（Phase 4 R1-4.1）：规则体未来新增其它
    // radius-md 用途时不脆断。
    expect(body).not.toMatch(/border-radius:\s*var\(--radius-md\)/);
  });

  it('retain-source checkbox gets an explicit monochrome accent (item 6-F2)', () => {
    // portal 挂 document.body，脱离 .adl-storage-settings 作用域 → 必须显式声明。
    const body = ruleBody(contextMenuCss, ".adl-confirm-dialog__retain input[type='checkbox']");
    expect(body).not.toBeNull();
    expect(body).toContain('accent-color: var(--text-primary)');
  });

  it('preflight issues render as bordered blocks with semantic side stripes (item 6-F1)', () => {
    const issues = ruleBody(contextMenuCss, '.adl-confirm-dialog__issues');
    expect(issues).not.toBeNull();
    expect(issues).toContain('background: var(--bg-secondary)');
    expect(issues).toContain('border-radius: var(--radius-sm)');
    expect(ruleBody(contextMenuCss, '.adl-confirm-dialog__issues--error')).toContain(
      'var(--danger)',
    );
    expect(ruleBody(contextMenuCss, '.adl-confirm-dialog__issues--warning')).toContain(
      'var(--pastel-warning-fg)',
    );
  });

  it('confirm dialog footer wraps so 3-button EN labels stay inside the dialog', () => {
    // 回归：英文 "Cancel + Migrate on next launch + Migrate now and restart"
    // 三键单行总宽超 400px 旧框内宽，按钮溢出到框外。footer 必须换行收进容器。
    // 兼容性已确认：通用两键框不受影响（原 dsh 堆叠页脚变体已随 dsh.css 作为死代码删除）。
    const footer = ruleBody(contextMenuCss, '.adl-confirm-dialog__footer');
    expect(footer).not.toBeNull();
    expect(footer).toContain('flex-wrap: wrap');
    const dialog = ruleBody(contextMenuCss, '.adl-confirm-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog).toContain('480px');
    expect(dialog).toContain('calc(100vw - 32px)');
    // 超窄视口守卫：min-width 同样收进视口（<312px 时 280px 不再撑破）。
    expect(dialog).toContain('min(280px');
    // 按钮防超宽 guards：极长单个文案也不撑破对话框。
    const btn = ruleBody(contextMenuCss, '.adl-confirm-dialog__footer .adl-btn');
    expect(btn).not.toBeNull();
    expect(btn).toContain('min-width: 0');
    expect(btn).toContain('max-width: 100%');
    // footer 内浏览器模式提示独占一行，不与按钮挤在同一行。
    const hint = ruleBody(contextMenuCss, '.adl-confirm-dialog__footer .adl-confirm-dialog__hint');
    expect(hint).not.toBeNull();
    expect(hint).toContain('flex-basis: 100%');
    // prompt 侧同类加固（面板更窄，仅 320px/360px）。
    const promptActions = ruleBody(composerCoreCss, '.adl-prompt-modal__actions');
    expect(promptActions).not.toBeNull();
    expect(promptActions).toContain('flex-wrap: wrap');
    const promptBtn = ruleBody(composerCoreCss, '.adl-prompt-modal__actions .adl-btn');
    expect(promptBtn).not.toBeNull();
    expect(promptBtn).toContain('min-width: 0');
    expect(promptBtn).toContain('max-width: 100%');
  });
});
