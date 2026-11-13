import { describe, expect, it } from 'vitest';
import {
  defaultAgentSiteRules,
  isAgentSiteRulesAtDefault,
  normalizeAgentSiteOverrides,
  normalizeAgentSiteRules,
} from './agentSiteRules';

describe('isAgentSiteRulesAtDefault', () => {
  it('accepts the built-in rules with no overrides', () => {
    expect(isAgentSiteRulesAtDefault(defaultAgentSiteRules(), [])).toBe(true);
  });

  it('ignores empty override entries (saving drops them)', () => {
    expect(
      isAgentSiteRulesAtDefault(defaultAgentSiteRules(), [
        { origin: 'https://a.example', disabledRuleIds: [], siteRules: [] },
      ]),
    ).toBe(true);
  });

  it('rejects a custom rule', () => {
    const rules = defaultAgentSiteRules();
    rules[0] = { ...rules[0], attributes: ['data-file-path'] };
    expect(isAgentSiteRulesAtDefault(rules, [])).toBe(false);
  });

  it('rejects a site that disables a global rule', () => {
    expect(
      isAgentSiteRulesAtDefault(defaultAgentSiteRules(), [
        {
          origin: 'https://a.example',
          disabledRuleIds: ['builtin-file-like-attribute'],
          siteRules: [],
        },
      ]),
    ).toBe(false);
  });

  it('rejects an added site-specific rule', () => {
    expect(
      isAgentSiteRulesAtDefault(defaultAgentSiteRules(), [
        {
          origin: 'https://a.example',
          disabledRuleIds: [],
          siteRules: [
            {
              id: 'site-rule',
              name: 'Site rule',
              enabled: true,
              matchSelector: 'button',
              attributes: ['title'],
              pathPreset: 'fileLike',
              action: 'file',
            },
          ],
        },
      ]),
    ).toBe(false);
  });
});

describe('normalizeAgentSiteRules', () => {
  it('forces the file action for the fileLike preset', () => {
    // 外部 Agent 直改 config.json 可能写出 fileLike + url 的矛盾组合；
    // 规范化后与「本地文件固定打开文件」的 UI 文案保持一致。
    const [normalized] = normalizeAgentSiteRules([
      {
        id: 'contradictory',
        name: 'contradictory',
        enabled: true,
        matchSelector: 'button',
        attributes: ['title'],
        pathPreset: 'fileLike',
        action: 'url',
      },
    ]);
    expect(normalized.action).toBe('file');
  });

  it('keeps the url action for regex rules', () => {
    const [normalized] = normalizeAgentSiteRules([
      {
        id: 'regex-url',
        name: 'regex-url',
        enabled: true,
        matchSelector: 'button',
        attributes: ['data-href'],
        pathPreset: 'regex',
        valueRegex: '^/docs/',
        action: 'url',
      },
    ]);
    expect(normalized.action).toBe('url');
  });
});

describe('normalizeAgentSiteOverrides', () => {
  it('drops duplicate origins and trims disabled ids', () => {
    expect(
      normalizeAgentSiteOverrides([
        { origin: ' https://a.example ', disabledRuleIds: ['r1', 'r1'], siteRules: [] },
        { origin: 'https://a.example', disabledRuleIds: [], siteRules: [] },
      ]),
    ).toEqual([{ origin: 'https://a.example', disabledRuleIds: ['r1'], siteRules: [] }]);
  });
});
