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

  it('includes conversation domain keys', () => {
    expect(enUS).toHaveProperty('conversation');
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

  it('includes provider domain keys', () => {
    expect(enUS).toHaveProperty('providerTitle');
  });

  it('includes approval domain keys', () => {
    expect(enUS).toHaveProperty('approvals');
  });

  it('includes agent domain keys', () => {
    expect(enUS).toHaveProperty('agentSelectorTitle');
  });

  it('includes mcp domain keys', () => {
    expect(enUS).toHaveProperty('mcpTitle');
  });

  it('includes ci domain keys', () => {
    expect(enUS).toHaveProperty('ciPanelTitle');
  });

  it('includes communicate domain keys', () => {
    expect(enUS).toHaveProperty('toolCommunicate');
  });

  it('includes commands domain keys', () => {
    expect(enUS).toHaveProperty('commandsEditorTitle');
  });

  it('includes permission domain keys', () => {
    expect(enUS).toHaveProperty('permissionTitle');
  });

  it('includes webSearch domain keys', () => {
    expect(enUS).toHaveProperty('webFetchPlaceholder');
  });

  it('includes sessionFork domain keys', () => {
    expect(enUS).toHaveProperty('sessionFork');
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

  it('includes notification domain keys', () => {
    expect(enUS).toHaveProperty('notifTitle');
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
