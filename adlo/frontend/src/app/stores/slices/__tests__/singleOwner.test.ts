import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(relative: string): string {
  return readFileSync(join(process.cwd(), 'src/app/stores', relative), 'utf8');
}

// 不变量：navigatorCollapsedByTool 与浏览器导航器宽度只由 uiSlice 归属提供一次
// （字段/初始值/写入器分别见 uiSlice.ts、uiSliceWidths.ts，登记键
// adl:ui.navigatorCollapsed 与 adl:browser.navigatorWidth 只在 registry 出现一次）。
// browser/terminal slice 不得复写字段、宽度与各自的折叠 action；调用点改用
// uiSlice 的 toggleNavigator(tool)/setNavigatorCollapsed(tool, collapsed)。
// 终端仍写同一物理键下独立的 terminal 槽位（toggleNavigator('terminal')），
// 不与浏览器的 browser 槽位共享。
describe('duplicated slice definitions', () => {
  it('browser slice does not redefine navigatorCollapsedByTool', () => {
    const content = source('slices/browserSlice.ts');
    expect(content).not.toContain('navigatorCollapsedByTool:');
    expect(content).not.toContain('setBrowserNavigatorWidth');
    expect(content).not.toContain('toggleBrowserNavigator');
    expect(content).not.toContain('setBrowserNavigatorCollapsed');
  });

  it('terminal slice does not redefine navigatorCollapsedByTool', () => {
    const content = source('slices/terminalSlice.ts');
    expect(content).not.toContain('navigatorCollapsedByTool:');
    expect(content).not.toContain('toggleTerminalNavigator');
    expect(content).not.toContain('setTerminalNavigatorCollapsed');
  });

  it('only one module declares the navigator width registry keys', () => {
    const content = source('slices/browserSlice.ts');
    expect(content).not.toContain('adl:browser.navigatorWidth');
  });
});
