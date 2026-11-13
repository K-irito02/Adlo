import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentSiteRulesControl } from './AgentSiteRulesControl';
import type { CopyDict } from '@i18n/types';
import type { AgentSiteRule, SettingItem } from '../../../kernel/types';

const t = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === 'settingsAgentRulesSummary') {
        return '{rules} 条全局 · {sites} 个站点覆盖';
      }
      return String(key);
    },
  },
) as CopyDict;

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

function buildItem(disabled = false): SettingItem {
  return {
    id: 'openMethod:agentSiteRules',
    groupId: 'openMethod',
    label: 'settingsAgentRules',
    type: 'agentSiteRules',
    value: {
      rules: [rule],
      overrides: [{ origin, disabledRuleIds: ['g1'], siteRules: [] }],
      sites: [{ origin, alias: 'dsh' }],
    },
    disabled,
  } as unknown as SettingItem;
}

describe('AgentSiteRulesControl summary', () => {
  it('shows global and overridden-site counts', () => {
    render(<AgentSiteRulesControl item={buildItem()} t={t} open={false} onToggle={vi.fn()} />);
    expect(screen.getByText('1 条全局 · 1 个站点覆盖')).toBeTruthy();
  });

  it('reflects the open state and notifies the parent', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <AgentSiteRulesControl item={buildItem()} t={t} open={false} onToggle={onToggle} />,
    );
    const button = screen.getByRole('button', { name: /settingsAgentRulesEdit/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<AgentSiteRulesControl item={buildItem()} t={t} open onToggle={onToggle} />);
    // 可访问名保持恒定（与 aria-expanded 同用），视觉文案仍随状态变化。
    const expandedButton = screen.getByRole('button', { name: /settingsAgentRulesEdit/ });
    expect(expandedButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('settingsAgentRulesCollapse')).toBeTruthy();
  });

  it('disables the entry when the setting is unavailable', () => {
    render(<AgentSiteRulesControl item={buildItem(true)} t={t} open={false} onToggle={vi.fn()} />);
    expect(
      (screen.getByRole('button', { name: /settingsAgentRulesEdit/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
