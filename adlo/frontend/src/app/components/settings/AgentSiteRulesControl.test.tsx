import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentSiteRulesControl } from './AgentSiteRulesControl';
import type { CopyDict } from '@i18n/types';
import type { AgentSiteRule, SettingItem } from '../../../kernel/types';

const t = new Proxy({}, { get: (_target, key) => String(key) }) as CopyDict;

const rule: AgentSiteRule = {
  id: 'rule-a',
  name: 'Rule A',
  enabled: true,
  matchSelector: 'button',
  attributes: ['title'],
  pathPreset: 'fileLike',
  action: 'file',
};

const origin = 'http://127.0.0.1:3080';

function renderControl(onChange: (id: string, value: unknown) => void) {
  const item = {
    id: 'openMethod:agentSiteRules',
    value: {
      rules: [rule],
      overrides: [{ origin, disabledRuleIds: [], siteRules: [] }],
      sites: [{ origin, alias: 'dsh' }],
    },
    disabled: false,
  } as unknown as SettingItem;
  render(<AgentSiteRulesControl item={item} t={t} onChange={onChange} />);
}

describe('AgentSiteRulesControl drafts', () => {
  it('cancelled global edits are not written when saving a site override', () => {
    const onChange = vi.fn();
    renderControl(onChange);

    fireEvent.click(screen.getByRole('button', { name: /settingsAgentRulesGlobalManage/ }));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Changed name' } });
    fireEvent.click(screen.getByText('settingsAgentRulesCancel'));

    fireEvent.click(screen.getByRole('button', { name: /dsh/ }));
    fireEvent.click(screen.getByText('settingsAgentRulesSave'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][1] as { rules: AgentSiteRule[] };
    expect(payload.rules.map((entry) => entry.name)).toEqual(['Rule A']);
  });

  it('keeps typed commas in the attributes input', () => {
    const onChange = vi.fn();
    renderControl(onChange);

    fireEvent.click(screen.getByRole('button', { name: /settingsAgentRulesGlobalManage/ }));
    const attributes = screen.getAllByRole('textbox')[2];
    // 逐次输入：旧实现会把 'title,' 回写成 'title'，导致无法继续输入逗号。
    fireEvent.change(attributes, { target: { value: 'title,' } });
    expect((attributes as HTMLInputElement).value).toBe('title,');
    fireEvent.change(attributes, { target: { value: 'title, aria-label' } });
    fireEvent.click(screen.getByText('settingsAgentRulesSave'));

    const payload = onChange.mock.calls[0][1] as { rules: AgentSiteRule[] };
    expect(payload.rules[0].attributes).toEqual(['title', 'aria-label']);
  });
});
