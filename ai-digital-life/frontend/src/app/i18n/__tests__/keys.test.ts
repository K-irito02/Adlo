import { describe, it, expect } from 'vitest';
import { enUS } from '../en-US/index';
import { zhCN } from '../zh-CN/index';

describe('i18n en-US namespace keys', () => {
  it('has a non-empty merged enUS export', () => {
    const keys = Object.keys(enUS);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('includes common domain keys', () => {
    expect(enUS).toHaveProperty('landingTitle');
    expect(enUS).toHaveProperty('loading');
  });

  it('includes workspace domain keys', () => {
    expect(enUS).toHaveProperty('projects');
  });

  it('includes terminal domain keys', () => {
    expect(enUS).toHaveProperty('commandBinary');
  });

  it('includes file domain keys', () => {
    expect(enUS).toHaveProperty('filePreview');
  });

  it('includes changes domain keys', () => {
    expect(enUS).toHaveProperty('patchPreview');
  });

  it('includes browser domain keys', () => {
    expect(enUS).toHaveProperty('browserAddress');
  });

  it('includes menu domain keys', () => {
    expect(enUS).toHaveProperty('menuFile');
  });

  it('includes models domain keys', () => {
    expect(enUS).toHaveProperty('modelLabel');
  });

  it('includes approval domain keys', () => {
    expect(enUS).toHaveProperty('approvals');
  });

  it('includes ci domain keys', () => {
    expect(enUS).toHaveProperty('ciPanelTitle');
  });

  it('includes communicate domain keys', () => {
    expect(enUS).toHaveProperty('toolCommunicate');
  });

  it('includes webSearch domain keys', () => {
    expect(enUS).toHaveProperty('webFetchPlaceholder');
  });

  it('includes lsp domain keys', () => {
    expect(enUS).toHaveProperty('lspTitle');
  });

  it('includes reference domain keys', () => {
    expect(enUS).toHaveProperty('referenceManagerTitle');
  });

  it('includes customAgent domain keys', () => {
    expect(enUS).toHaveProperty('customAgentManagerTitle');
  });

  it('includes durable domain keys', () => {
    expect(enUS).toHaveProperty('durableSessionRunning');
  });

  it('includes settings domain keys', () => {
    expect(enUS).toHaveProperty('settingsTitle');
  });

  it('includes reset-all confirm copy in both locales', () => {
    expect(enUS.settingsResetConfirmTitle).toBe('Reset all to defaults?');
    expect(enUS.settingsResetConfirmMessage).toBe(
      'All settings will be restored to their defaults. This cannot be undone.',
    );
    expect(zhCN.settingsResetConfirmTitle).toBe('恢复全部默认？');
    expect(zhCN.settingsResetConfirmMessage).toBe('所有设置将恢复为默认值，此操作不可撤销。');
  });

  it('no longer exposes the legacy settingsModels or settingsProviders keys', () => {
    expect(enUS).not.toHaveProperty('settingsModels');
    expect(enUS).not.toHaveProperty('settingsModelsDesc');
    expect(enUS).not.toHaveProperty('settingsProviders');
    expect(enUS).not.toHaveProperty('settingsProvidersDesc');
    expect(zhCN).not.toHaveProperty('settingsModels');
    expect(zhCN).not.toHaveProperty('settingsModelsDesc');
    expect(zhCN).not.toHaveProperty('settingsProviders');
    expect(zhCN).not.toHaveProperty('settingsProvidersDesc');
  });

  it('includes notification domain keys', () => {
    expect(enUS).toHaveProperty('notifTitle');
  });

  it('includes error toast domain keys', () => {
    expect(enUS).toHaveProperty('errorsGenericTitle');
    expect(enUS).toHaveProperty('errorsWorkspace');
    expect(enUS).toHaveProperty('errorsInfo');
    expect(enUS).toHaveProperty('errorsMore');
    expect(enUS).toHaveProperty('errorsClearAll');
    expect(enUS).toHaveProperty('errorsRegionLabel');
    expect(zhCN).toHaveProperty('errorsGenericTitle');
    expect(zhCN).toHaveProperty('errorsWorkspace');
    expect(zhCN).toHaveProperty('errorsInfo');
    expect(zhCN).toHaveProperty('errorsClearAll');
    expect(zhCN).toHaveProperty('errorsRegionLabel');
  });

  it('browserClearAllOpenTabs copy is close-all-open-tabs', () => {
    expect(enUS.browserClearAllOpenTabs).toBe('Close all open tabs');
    expect(zhCN.browserClearAllOpenTabs).toBe('关闭所有已打开标签页');
  });
});

describe('i18n zh-CN mirror', () => {
  it('zh-CN has same top-level keys as en-US (parity check)', () => {
    const enKeys = new Set(Object.keys(enUS));
    const zhKeys = new Set(Object.keys(zhCN));
    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    const extraInZh = [...zhKeys].filter((k) => !enKeys.has(k));
    const msg: string[] = [];
    if (missingInZh.length) {
      msg.push(`missing in zh-CN: ${missingInZh.slice(0, 10).join(', ')}`);
    }
    if (extraInZh.length) {
      msg.push(`extra in zh-CN: ${extraInZh.slice(0, 10).join(', ')}`);
    }
    expect(msg.join('; '), msg.join('; ')).toBe('');
  });
});

describe('workspace settings loading copy (rename + plain language)', () => {
  const HINT_FIELDS = [
    'maxConcurrentWorkspacesDesc',
    'priorityListDesc',
    'priorityListTooltip',
    'deferredListDesc',
    'deferredListTooltip',
    'workspaceTagListDesc',
    'workspaceTagListTooltip',
  ] as const;

  it('renames 工作区标签列表 to 常规加载 / Regular', () => {
    expect(zhCN.workspaceTagList).toBe('常规加载');
    expect(enUS.workspaceTagList).toBe('Regular');
  });

  it('zh hint copy no longer mentions the old list name', () => {
    for (const key of HINT_FIELDS) {
      expect(String(zhCN[key]), key).not.toContain('工作区标签列表');
    }
    expect(String(zhCN.workspaceTagListEmpty)).not.toContain('工作区标签列表');
  });

  it('en hint copy no longer mentions the old list name', () => {
    for (const key of HINT_FIELDS) {
      expect(String(enUS[key]), key).not.toMatch(/workspace tag list/i);
    }
    expect(String(enUS.workspaceTagListEmpty)).not.toMatch(/workspace tag list/i);
  });

  it('zh hint copy avoids English jargon mixing', () => {
    const banned = /priority|deferred|appReady|maxConcurrent|min\(|CPU|Git/i;
    for (const key of HINT_FIELDS) {
      expect(String(zhCN[key]), key).not.toMatch(banned);
    }
  });

  it('zh list tooltips use · bullet lines for readability', () => {
    expect(String(zhCN.priorityListTooltip)).toContain('· ');
    expect(String(zhCN.deferredListTooltip)).toContain('· ');
    expect(String(zhCN.workspaceTagListTooltip)).toContain('· ');
    // 常规加载 tooltip 以新名称开篇
    expect(String(zhCN.workspaceTagListTooltip)).toContain('常规加载');
    expect(String(enUS.workspaceTagListTooltip)).toContain('Regular');
  });

  it('list hint copy uses titled sections without bracket decorations', () => {
    expect(zhCN.listHintIntroTitle).toBe('简介');
    expect(enUS.listHintIntroTitle).toBe('Overview');
    for (const key of [
      'priorityListTooltip',
      'deferredListTooltip',
      'workspaceTagListTooltip',
    ] as const) {
      const zh = String(zhCN[key]);
      const en = String(enUS[key]);
      expect(zh.startsWith('# '), key).toBe(true);
      expect(en.startsWith('# '), key).toBe(true);
      expect(zh, key).not.toMatch(/[【】\[\]]/);
      expect(en, key).not.toMatch(/[【】\[\]]/);
      expect(zh, key).not.toContain('\n\n');
      expect(en, key).not.toContain('\n\n');
    }
  });
});

describe('git-visualization copy', () => {
  it('zh-CN branch graph desc separates legend symbols from text and avoids English "tagged"', () => {
    const desc = String(zhCN.gitVisBranchGraphDesc);
    // A space must sit between the legend glyph (●/■) and the following
    // Chinese character, and "tagged" must not leak through as English.
    expect(desc).toContain('● 圆点');
    expect(desc).toContain('■ 方块');
    expect(desc).toContain('带标签的版本以徽章标记');
    expect(desc).not.toMatch(/tagged/i);
  });
});
