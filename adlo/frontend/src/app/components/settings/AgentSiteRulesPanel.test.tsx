import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentSiteRulesPanel } from './AgentSiteRulesPanel';
import { zhCN } from '../../i18n/zh-CN';
import { enUS } from '../../i18n/en-US';
import type { CopyDict } from '@i18n/types';
import type { AgentSiteRule, SettingItem } from '../../../kernel/types';

const origin = 'http://127.0.0.1:3080';

const t = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === 'settingsAgentRulesPromptGlobal') {
        return 'SNAPSHOT\n{configJson}\nPATH {configPath}\nTARGET {testTarget}';
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

const siteRule: AgentSiteRule = {
  id: 'site-rule-a',
  name: 'Site Rule A',
  enabled: true,
  matchSelector: 'button',
  attributes: ['data-file'],
  pathPreset: 'fileLike',
  action: 'file',
};

function buildItem(overrides = true): SettingItem {
  return {
    id: 'openMethod:agentSiteRules',
    groupId: 'openMethod',
    label: 'settingsAgentRules',
    type: 'agentSiteRules',
    value: {
      rules: [rule],
      overrides: overrides ? [{ origin, disabledRuleIds: [], siteRules: [siteRule] }] : [],
      sites: [{ origin, alias: 'dsh' }],
    },
    disabled: false,
  } as unknown as SettingItem;
}

function renderPanel(onChange = vi.fn(), onClose = vi.fn(), item = buildItem()) {
  const view = render(
    <AgentSiteRulesPanel item={item} t={t} onChange={onChange} onClose={onClose} />,
  );
  return { onChange, onClose, ...view };
}

function saveButton() {
  return screen.queryByRole('button', { name: 'settingsAgentRulesSave' });
}

describe('AgentSiteRulesPanel inline editor', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('hides cancel/save until the active tab differs from its snapshot', () => {
    const { onChange } = renderPanel();
    expect(saveButton()).toBeNull();

    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Changed name' },
    });
    expect(saveButton()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesSave' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeNull();
  });

  it('saves the whole workbench without closing the panel', () => {
    const { onChange, onClose } = renderPanel();

    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Changed name' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /settingsAgentRulesSiteTab/ }));
    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Changed site name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesSave' }));

    expect(onClose).not.toHaveBeenCalled();
    const payload = onChange.mock.calls[0][1] as {
      rules: AgentSiteRule[];
      overrides: { siteRules: AgentSiteRule[] }[];
    };
    expect(payload.rules[0].name).toBe('Changed name');
    expect(payload.overrides[0].siteRules[0].name).toBe('Changed site name');
    expect(screen.getByLabelText('settingsAgentRulesName')).toBeTruthy();
  });

  it('keeps typed commas in the attributes input', () => {
    const { onChange } = renderPanel();

    const attributes = screen.getByLabelText('settingsAgentRulesAttributes');
    fireEvent.change(attributes, { target: { value: 'title,' } });
    expect((attributes as HTMLInputElement).value).toBe('title,');
    fireEvent.change(attributes, { target: { value: 'title, aria-label' } });
    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesSave' }));

    const payload = onChange.mock.calls[0][1] as { rules: AgentSiteRule[] };
    expect(payload.rules[0].attributes).toEqual(['title', 'aria-label']);
  });

  it('blocks saving a rule whose custom regex is invalid', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('settingsAgentRulesPreset'), {
      target: { value: 'regex' },
    });
    fireEvent.change(screen.getByLabelText('settingsAgentRulesRegex'), {
      target: { value: '[' },
    });

    expect(
      (screen.getByRole('button', { name: 'settingsAgentRulesSave' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText('settingsAgentRulesRuleError')).toBeTruthy();
  });

  it('disables the action select for the built-in local-file preset', () => {
    renderPanel();
    expect((screen.getByLabelText('settingsAgentRulesAction') as HTMLSelectElement).disabled).toBe(
      true,
    );
  });

  it('opens the help card in a floating hint layer', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesHelpShow' }));
    expect(screen.getByText('settingsAgentRulesHelpGlobalTitle')).toBeTruthy();
    expect(screen.getByText('settingsAgentRulesHelpGlobalStep1')).toBeTruthy();
    expect(screen.getByText('settingsAgentRulesHelpNote')).toBeTruthy();
    expect(document.querySelector('.hint-card')).not.toBeNull();
  });

  it('uses the real setting names in the help and leaves no raw placeholders', () => {
    render(
      <AgentSiteRulesPanel
        item={buildItem()}
        t={zhCN as unknown as CopyDict}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '使用说明' }));
    const card = document.querySelector('.hint-card') as HTMLElement | null;
    expect(card).not.toBeNull();
    // 整句断言：占位符互换（intercept ↔ whitelist）时仍会同时出现两个词，
    // 但句子不成立，必须能变红。
    expect(card?.textContent).toContain('先确认「智能体站点链接拦截」与「智能体网址白名单」');
    expect(card?.textContent).not.toContain('{');
  });

  it('en-US help formats every placeholder', () => {
    render(
      <AgentSiteRulesPanel
        item={buildItem()}
        t={enUS as unknown as CopyDict}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: enUS.settingsAgentRulesHelpShow }));
    const card = document.querySelector('.hint-card') as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card?.textContent).not.toContain('{');
  });

  it('site help uses the real whitelist name and tab name', () => {
    render(
      <AgentSiteRulesPanel
        item={buildItem()}
        t={zhCN as unknown as CopyDict}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /站点覆盖/ }));
    fireEvent.click(screen.getByRole('button', { name: '使用说明' }));
    const card = document.querySelector('.hint-card') as HTMLElement | null;
    expect(card?.textContent).toContain('智能体网址白名单');
    expect(card?.textContent).toContain('站点覆盖');
    expect(card?.textContent).not.toContain('{');
  });

  it('copies a prompt containing the live rule snapshot and config path', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /settingsAgentRulesCopyPrompt/ }));

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });
    const text = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(text).toContain('agent_site_rules');
    expect(text).toContain('agent_site_overrides');
    expect(text).toContain('config.json');
    expect(text).toContain('"id": "rule-a"');
  });

  it('reflects unsaved global edits in the site tab global-rule switches', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Changed name' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /settingsAgentRulesSiteTab/ }));

    expect(screen.getByRole('switch', { name: 'Changed name' })).toBeTruthy();
  });

  it('uses switches (not checkboxes) for enabled state and site global rules', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /settingsAgentRulesSiteTab/ }));

    expect(screen.queryByRole('checkbox')).toBeNull();
    const globalToggle = screen.getByRole('switch', { name: 'Rule A' });
    fireEvent.click(globalToggle);
    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesSave' }));

    const payload = onChange.mock.calls[0][1] as {
      overrides: { origin: string; disabledRuleIds: string[] }[];
    };
    expect(payload.overrides[0].disabledRuleIds).toEqual(['rule-a']);
  });

  it('shows the whitelist empty state for the site scope', () => {
    const item = buildItem(false);
    item.value = {
      rules: [rule],
      overrides: [],
      sites: [],
    } as SettingItem['value'];
    renderPanel(vi.fn(), vi.fn(), item);

    fireEvent.click(screen.getByRole('tab', { name: /settingsAgentRulesSiteTab/ }));
    expect(screen.getByText('settingsAgentRulesNoSites')).toBeTruthy();
    expect(screen.getByText('settingsAgentRulesNoSitesHint')).toBeTruthy();
  });

  it('silently saves dirty drafts when the panel unmounts', () => {
    const { onChange, unmount } = renderPanel();
    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Changed name' },
    });
    unmount();

    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][1] as { rules: AgentSiteRule[] };
    expect(payload.rules[0].name).toBe('Changed name');
  });

  it('does not auto-save when the user cancels', () => {
    const { onChange, onClose, unmount } = renderPanel();
    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Changed name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesCancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores an unsaved draft from localStorage after a remount', () => {
    const first = renderPanel();
    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Changed name' },
    });
    first.unmount();

    const second = renderPanel();
    expect((screen.getByLabelText('settingsAgentRulesName') as HTMLInputElement).value).toBe(
      'Changed name',
    );
    // 恢复即写回配置（既有语义）：提交后基线同步，footer 不残留。
    expect(second.onChange).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeNull();
  });

  it('shows cancel/save on the site tab even when the site has no rules', () => {
    renderPanel(vi.fn(), vi.fn(), buildItem(false));
    fireEvent.click(screen.getByRole('tab', { name: /settingsAgentRulesSiteTab/ }));
    // 站点没有站点规则时没有右侧编辑器；只切换「全局启用规则」也应出现 footer。
    fireEvent.click(screen.getByRole('switch', { name: 'Rule A' }));
    expect(saveButton()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'settingsAgentRulesCancel' })).toBeTruthy();
  });

  it('clears the draft backup once a save lands', () => {
    const key = 'adl.agent-site-rules.draft.v1.openMethod:agentSiteRules';
    const { onChange } = renderPanel();
    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Changed name' },
    });
    expect(localStorage.getItem(key)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesSave' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('keeps an invalid regex draft and never auto-saves it on unmount', () => {
    const key = 'adl.agent-site-rules.draft.v1.openMethod:agentSiteRules';
    const onChange = vi.fn();
    const { unmount } = renderPanel(onChange);
    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesAdd' }));
    fireEvent.change(screen.getByLabelText('settingsAgentRulesPreset'), {
      target: { value: 'regex' },
    });
    expect(saveButton()?.hasAttribute('disabled')).toBe(true);

    unmount();
    expect(onChange).not.toHaveBeenCalled();
    // 草稿保留，重开面板可继续修正，而不是被当成「已保存」丢掉。
    expect(localStorage.getItem(key)).not.toBeNull();

    // 重开也不得自动提交非法草稿（canSave 守卫与自动保存同口径）。
    const remounted = renderPanel();
    expect(remounted.onChange).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText('settingsAgentRulesName') as HTMLInputElement).value,
    ).toBeTruthy();
  });

  it('persists the external-change flag and never auto-submits the draft', () => {
    const key = 'adl.agent-site-rules.draft.v1.openMethod:agentSiteRules';
    const onChange = vi.fn();
    const item = buildItem();
    const view = render(
      <AgentSiteRulesPanel item={item} t={t} onChange={onChange} onClose={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('settingsAgentRulesName'), {
      target: { value: 'Draft name' },
    });
    // 模拟 config watcher：父层以新配置重渲染（新增一条全局规则改变签名）。
    const changed = buildItem();
    const changedValue = changed.value as unknown as {
      rules: AgentSiteRule[];
      overrides: unknown[];
      sites: { origin: string; alias?: string }[];
    };
    changedValue.rules = [...changedValue.rules, { ...rule, id: 'rule-b', name: 'Rule B' }];
    view.rerender(
      <AgentSiteRulesPanel item={changed} t={t} onChange={onChange} onClose={vi.fn()} />,
    );

    const backup = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      base?: string;
      externalChanged?: boolean;
    };
    expect(backup.externalChanged).toBe(true);

    // 第二次外部变更：state 已是 true，不能再依赖重渲染刷新 base。
    const changedAgain = buildItem();
    const changedAgainValue = changedAgain.value as unknown as {
      rules: AgentSiteRule[];
      overrides: unknown[];
      sites: { origin: string; alias?: string }[];
    };
    changedAgainValue.rules = [
      ...changedAgainValue.rules,
      { ...rule, id: 'rule-c', name: 'Rule C' },
    ];
    view.rerender(
      <AgentSiteRulesPanel item={changedAgain} t={t} onChange={onChange} onClose={vi.fn()} />,
    );
    const backupAgain = JSON.parse(localStorage.getItem(key) ?? '{}') as { base?: string };
    expect(backupAgain.base).not.toBe(backup.base);
    view.unmount();
    expect(onChange).not.toHaveBeenCalled();

    // 重开：草稿恢复，但挂载期不得自动覆盖外部写入。
    const remounted = renderPanel(onChange, vi.fn(), changedAgain);
    expect((screen.getByLabelText('settingsAgentRulesName') as HTMLInputElement).value).toBe(
      'Draft name',
    );
    expect(remounted.onChange).not.toHaveBeenCalled();
  });

  it('shows a visible failure state when copying fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsAgentRulesCopyPrompt' }));
    const button = screen.getByRole('button', { name: 'settingsAgentRulesCopyPrompt' });
    await vi.waitFor(() => expect(button.getAttribute('data-copy-state')).toBe('error'));
    expect(document.querySelector('.adl-agent-rules .sr-only')?.textContent).toContain(
      'settingsAgentRulesCopyFailed',
    );
  });
});
