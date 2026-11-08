// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { findRuleGroups, ruleBody } from './testing/cssRules';

const filesPanelCss = readFileSync(
  new URL('./regions/rightpanel/files-panel-core.css', import.meta.url),
  'utf8',
);
const toolSwitcherCss = readFileSync(
  new URL('./regions/rightpanel/tool-switcher.css', import.meta.url),
  'utf8',
);
const settingsCss = readFileSync(new URL('./components/settings.css', import.meta.url), 'utf8');

/**
 * 从 `.adl-rightpanel--toolbar-collapsed` 的规则组里找出「选择器包含 target 且
 * 规则体声明 display:none」的那一条。逐条比对（而不是把整组文本 join 后
 * toContain），避免规则拆分后「目标选择器存在但没被隐藏」也误通过。
 */
function hidingRuleFor(css: string, target: string): string | null {
  for (const block of findRuleGroups(css, '.adl-rightpanel--toolbar-collapsed')) {
    const open = block.indexOf('{');
    // 规则组文本会带上方的注释；先剥注释再取选择器，避免注释里出现的
    // 选择器字样让「选择器已改名/写错」的回归仍然通过。
    const selector = block.slice(0, open).replace(/\/\*[\s\S]*?\*\//g, '');
    if (!selector.includes(target)) {
      continue;
    }
    if (/display:\s*none/.test(block.slice(open))) {
      return block;
    }
  }
  return null;
}

/**
 * 「折叠/展开第一行工具栏」的 CSS 契约：
 * - 动作区按钮与标签区共用 30px 图标格（此前动作区没有这些变量，新按钮退回 16px）；
 * - 折叠态对五个面板统一生效（四个 `.adl-tool-context` + 设置面板头部）；
 * - 设置面板头部与其它面板第一行工具栏同高（40px），保证展开态也统一。
 */
describe('right panel first-row toolbar collapse contract', () => {
  it('uses the shared 30px icon-strip size inside the actions group', () => {
    const body = ruleBody(toolSwitcherCss, '.adl-toolswitcher__actions');
    expect(body).toContain('--adl-iconstrip-button-size: 30px');
  });

  it('hides the first-row toolbar of every right panel while collapsed', () => {
    expect(hidingRuleFor(filesPanelCss, '.adl-tool-context')).not.toBeNull();
    expect(hidingRuleFor(filesPanelCss, '.adl-settings-panel__header')).not.toBeNull();
  });

  it('keeps the first-row toolbars of all five panels on the same 40px baseline', () => {
    const settingsHeader = ruleBody(settingsCss, '.adl-settings-panel__header');
    const filesToolbar = ruleBody(filesPanelCss, '.adl-tool-context--files');
    expect(settingsHeader).toContain('min-height: 40px');
    expect(filesToolbar).toContain('min-height: 40px');
  });
});
