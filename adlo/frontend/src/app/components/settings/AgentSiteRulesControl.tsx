import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CopyDict } from '../../i18n';
import type {
  AgentSiteOverride,
  AgentSiteRule,
  AgentSiteRulesCommand,
  AgentSiteRulesSettingValue,
  SettingItem,
  SettingValue,
} from '../../../kernel/types';
import { formatT } from '../../i18n';
import { IconPlus, IconDelete, IconPencil, IconResetDefaults } from '../../icons';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  defaultAgentSiteRules,
  normalizeAgentSiteOverrides,
  normalizeAgentSiteRules,
} from '../../../shared/agentSiteRules';

type DialogState = { kind: 'global' } | { kind: 'site'; origin: string } | null;

const DEFAULT_SELECTOR = 'button, a, [role="button"], [role="link"]';

function cloneRules(rules: AgentSiteRule[]): AgentSiteRule[] {
  return rules.map((rule) => ({ ...rule, attributes: [...rule.attributes] }));
}

function cloneOverrides(overrides: AgentSiteOverride[]): AgentSiteOverride[] {
  return overrides.map((entry) => ({
    ...entry,
    disabledRuleIds: [...entry.disabledRuleIds],
    siteRules: cloneRules(entry.siteRules),
  }));
}

function createRule(t: CopyDict): AgentSiteRule {
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: t.settingsAgentRulesAdd,
    enabled: true,
    matchSelector: DEFAULT_SELECTOR,
    attributes: ['title'],
    pathPreset: 'fileLike',
    action: 'file',
  };
}

function RuleListEditor({
  rules,
  setRules,
  t,
  disabled,
}: {
  rules: AgentSiteRule[];
  setRules: (next: AgentSiteRule[]) => void;
  t: CopyDict;
  disabled: boolean;
}) {
  const [selectedId, setSelectedId] = useState(rules[0]?.id ?? '');
  const [attributesText, setAttributesText] = useState('');

  useEffect(() => {
    const selected = rules.find((rule) => rule.id === selectedId) ?? rules[0];
    if (selected?.id !== selectedId) {
      setSelectedId(selected?.id ?? '');
    }
    setAttributesText(selected ? selected.attributes.join(', ') : '');
    // 只在切换/增删规则时回填文本：若依赖 rules 本身，用户每次输入都会触发
    // 父层新数组 → 文本被 join 覆盖，导致无法输入逗号。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, rules.length]);

  const selected = rules.find((rule) => rule.id === selectedId);

  const updateSelected = useCallback(
    (patch: Partial<AgentSiteRule>) => {
      if (!selected) {
        return;
      }
      setRules(rules.map((rule) => (rule.id === selected.id ? { ...rule, ...patch } : rule)));
    },
    [rules, selected, setRules],
  );

  const addRule = useCallback(() => {
    const next = createRule(t);
    setRules([...rules, next]);
    setSelectedId(next.id);
  }, [rules, setRules, t]);

  const deleteSelected = useCallback(() => {
    if (!selected) {
      return;
    }
    setRules(rules.filter((rule) => rule.id !== selected.id));
  }, [rules, selected, setRules]);

  const regexError = useMemo(() => {
    if (!selected || selected.pathPreset !== 'regex') {
      return '';
    }
    try {
      // Validate flags even when regex is a trivial string.
      RegExp(selected.valueRegex ?? '', selected.regexFlags ?? '');
      return '';
    } catch {
      return t.settingsAgentRulesRuleError;
    }
  }, [selected, t.settingsAgentRulesRuleError]);

  return (
    <div className="adl-agent-site-rules__editor">
      <div className="adl-agent-site-rules__list" aria-label={t.settingsAgentRules}>
        {rules.map((rule) => (
          <button
            key={rule.id}
            type="button"
            className={`adl-agent-site-rules__list-item${rule.id === selectedId ? ' is-selected' : ''}`}
            onClick={() => setSelectedId(rule.id)}
            disabled={disabled}
          >
            <span className="adl-agent-site-rules__list-name">
              {rule.id === 'builtin-file-like-attribute'
                ? t.settingsAgentRulesBuiltinFileLike
                : rule.name}
            </span>
            {!rule.enabled ? (
              <span className="adl-agent-site-rules__list-disabled">
                {t.settingsAgentRulesDisabled}
              </span>
            ) : null}
          </button>
        ))}
        <div className="adl-agent-site-rules__list-actions">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={addRule}
            disabled={disabled}
            aria-label={t.settingsAgentRulesAdd}
            title={t.settingsAgentRulesAdd}
          >
            <IconPlus size={14} decorative />
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={deleteSelected}
            disabled={disabled || !selected}
            aria-label={t.settingsAgentRulesDelete}
            title={t.settingsAgentRulesDelete}
          >
            <IconDelete size={14} decorative />
          </button>
        </div>
      </div>
      <div className="adl-agent-site-rules__form">
        {selected ? (
          <>
            <label className="adl-settings-allowlist__label" htmlFor="adl-rule-name">
              {t.settingsAgentRulesName}
            </label>
            <input
              id="adl-rule-name"
              className="adl-prompt-modal__input"
              value={selected.name}
              onChange={(event) => updateSelected({ name: event.currentTarget.value })}
              autoComplete="off"
              disabled={disabled}
            />
            <label className="adl-settings-allowlist__label" htmlFor="adl-rule-selector">
              {t.settingsAgentRulesSelector}
            </label>
            <input
              id="adl-rule-selector"
              className="adl-prompt-modal__input"
              value={selected.matchSelector}
              onChange={(event) => updateSelected({ matchSelector: event.currentTarget.value })}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
            />
            <label className="adl-settings-allowlist__label" htmlFor="adl-rule-attrs">
              {t.settingsAgentRulesAttributes}
            </label>
            <input
              id="adl-rule-attrs"
              className="adl-prompt-modal__input"
              value={attributesText}
              onChange={(event) => {
                const text = event.currentTarget.value;
                setAttributesText(text);
                updateSelected({
                  attributes: text
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                });
              }}
              placeholder={t.settingsAgentRulesAttributesHint}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
            />
            <small className="adl-agent-site-rules__hint">
              {t.settingsAgentRulesAttributesHint}
            </small>
            <div className="adl-agent-site-rules__two-col">
              <div>
                <label className="adl-settings-allowlist__label" htmlFor="adl-rule-preset">
                  {t.settingsAgentRulesPreset}
                </label>
                <select
                  id="adl-rule-preset"
                  className="adl-prompt-modal__input"
                  value={selected.pathPreset}
                  onChange={(event) => {
                    const pathPreset = event.currentTarget.value as 'fileLike' | 'regex';
                    updateSelected(
                      pathPreset === 'fileLike'
                        ? { pathPreset, valueRegex: undefined, regexFlags: undefined }
                        : { pathPreset },
                    );
                  }}
                  disabled={disabled}
                >
                  <option value="fileLike">{t.settingsAgentRulesPresetFileLike}</option>
                  <option value="regex">{t.settingsAgentRulesPresetRegex}</option>
                </select>
              </div>
              <div>
                <label className="adl-settings-allowlist__label" htmlFor="adl-rule-action">
                  {t.settingsAgentRulesAction}
                </label>
                <select
                  id="adl-rule-action"
                  className="adl-prompt-modal__input"
                  value={selected.action}
                  onChange={(event) =>
                    updateSelected({ action: event.currentTarget.value as 'file' | 'url' })
                  }
                  disabled={disabled}
                >
                  <option value="file">{t.settingsAgentRulesActionFile}</option>
                  <option value="url">{t.settingsAgentRulesActionUrl}</option>
                </select>
              </div>
            </div>
            {selected.pathPreset === 'regex' ? (
              <div className="adl-agent-site-rules__two-col">
                <div>
                  <label className="adl-settings-allowlist__label" htmlFor="adl-rule-regex">
                    {t.settingsAgentRulesRegex}
                  </label>
                  <input
                    id="adl-rule-regex"
                    className={`adl-prompt-modal__input${regexError ? ' adl-prompt-modal__input--error' : ''}`}
                    value={selected.valueRegex ?? ''}
                    onChange={(event) => updateSelected({ valueRegex: event.currentTarget.value })}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                  />
                </div>
                <div>
                  <label className="adl-settings-allowlist__label" htmlFor="adl-rule-flags">
                    {t.settingsAgentRulesRegexFlags}
                  </label>
                  <input
                    id="adl-rule-flags"
                    className="adl-prompt-modal__input"
                    value={selected.regexFlags ?? ''}
                    onChange={(event) => updateSelected({ regexFlags: event.currentTarget.value })}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="i"
                    disabled={disabled}
                  />
                </div>
              </div>
            ) : null}
            {regexError ? <div className="adl-prompt-modal__error">{regexError}</div> : null}
            <label className="adl-agent-site-rules__enabled">
              <input
                type="checkbox"
                checked={selected.enabled}
                onChange={(event) => updateSelected({ enabled: event.currentTarget.checked })}
                disabled={disabled}
              />
              {t.settingsAgentRulesEnabled}
            </label>
          </>
        ) : (
          <div className="adl-empty-hint">{t.settingsAgentRulesEmptyGlobal}</div>
        )}
      </div>
    </div>
  );
}

export function AgentSiteRulesControl({
  item,
  t,
  onChange,
}: {
  item: SettingItem;
  t: CopyDict;
  onChange: (id: string, value: SettingValue) => void;
}) {
  const rawValue = item.value as AgentSiteRulesCommand;
  const isValue = !rawValue || !('kind' in rawValue);
  const value: AgentSiteRulesSettingValue = isValue
    ? {
        rules: (rawValue as AgentSiteRulesSettingValue).rules ?? defaultAgentSiteRules(),
        overrides: (rawValue as AgentSiteRulesSettingValue).overrides ?? [],
        sites: (rawValue as AgentSiteRulesSettingValue).sites ?? [],
      }
    : { rules: defaultAgentSiteRules(), overrides: [], sites: [] };
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirmGlobalReset, setConfirmGlobalReset] = useState(false);
  const [confirmSiteReset, setConfirmSiteReset] = useState<string | null>(null);

  const closeDialog = () => {
    // 取消/关闭一律丢弃草稿：两个弹窗的草稿不得在之后保存另一个弹窗时被写回。
    setGlobalDraft(cloneRules(value.rules));
    setSiteDraft(cloneOverrides(value.overrides));
    setDialog(null);
  };

  const [globalDraft, setGlobalDraft] = useState<AgentSiteRule[]>(value.rules);
  const [siteDraft, setSiteDraft] = useState<AgentSiteOverride[]>(value.overrides);

  useEffect(() => {
    if (dialog?.kind === 'global') {
      setGlobalDraft(cloneRules(value.rules));
    } else if (dialog?.kind === 'site') {
      setSiteDraft(cloneOverrides(value.overrides));
    }
    // Reset draft only when a dialog opens, not on every backend refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog?.kind === 'global' ? 'global' : dialog?.kind === 'site' ? dialog.origin : '']);

  const saveGlobal = useCallback(() => {
    // 只提交全局规则：站点覆盖取当前值，避免用另一弹窗的陈旧草稿静默覆盖。
    onChange(item.id, {
      rules: normalizeAgentSiteRules(globalDraft),
      overrides: normalizeAgentSiteOverrides(value.overrides),
      sites: value.sites,
    });
    setDialog(null);
  }, [globalDraft, item.id, onChange, value.overrides, value.sites]);

  const currentSiteOverride = useMemo(() => {
    if (dialog?.kind !== 'site') {
      return undefined;
    }
    return siteDraft.find((entry) => entry.origin === dialog.origin);
  }, [dialog, siteDraft]);

  const siteRules = currentSiteOverride?.siteRules ?? [];
  const disabledGlobalRuleIds = currentSiteOverride?.disabledRuleIds ?? [];

  const toggleDisabledGlobal = useCallback(
    (ruleId: string) => {
      if (dialog?.kind !== 'site') {
        return;
      }
      setSiteDraft((prev) => {
        const existing = prev.find((entry) => entry.origin === dialog.origin);
        const disabled = existing?.disabledRuleIds ?? [];
        const nextDisabled = disabled.includes(ruleId)
          ? disabled.filter((id) => id !== ruleId)
          : [...disabled, ruleId];
        const nextOverride = {
          origin: dialog.origin,
          disabledRuleIds: nextDisabled,
          siteRules: existing?.siteRules ?? [],
        };
        const rest = prev.filter((entry) => entry.origin !== dialog.origin);
        return nextOverride.disabledRuleIds.length === 0 && nextOverride.siteRules.length === 0
          ? rest
          : [...rest, nextOverride];
      });
    },
    [dialog],
  );

  const setSiteSpecificRules = useCallback(
    (rules: AgentSiteRule[]) => {
      if (dialog?.kind !== 'site') {
        return;
      }
      setSiteDraft((prev) => {
        const existing = prev.find((entry) => entry.origin === dialog.origin);
        const nextOverride = {
          origin: dialog.origin,
          disabledRuleIds: existing?.disabledRuleIds ?? [],
          siteRules: rules,
        };
        const rest = prev.filter((entry) => entry.origin !== dialog.origin);
        return nextOverride.disabledRuleIds.length === 0 && nextOverride.siteRules.length === 0
          ? rest
          : [...rest, nextOverride];
      });
    },
    [dialog],
  );

  const saveSite = useCallback(() => {
    // 只提交站点覆盖：全局规则取当前值，避免用另一弹窗的陈旧草稿静默覆盖。
    onChange(item.id, {
      rules: normalizeAgentSiteRules(value.rules),
      overrides: normalizeAgentSiteOverrides(siteDraft),
      sites: value.sites,
    });
    setDialog(null);
  }, [item.id, onChange, siteDraft, value.rules, value.sites]);

  const siteLabel = useCallback(
    (origin: string) => {
      const site = value.sites.find((entry) => entry.origin === origin);
      return site?.alias ? `${site.alias} · ${origin}` : origin;
    },
    [value.sites],
  );

  return (
    <div className="adl-agent-site-rules">
      <div className="adl-agent-site-rules__global-row">
        <button
          type="button"
          className="adl-btn adl-btn--secondary adl-btn--sm"
          onClick={() => setDialog({ kind: 'global' })}
          disabled={item.disabled}
        >
          <IconPencil size={14} decorative />
          {t.settingsAgentRulesGlobalManage} · {value.rules.length}
        </button>
        <button
          type="button"
          className="adl-icon-btn adl-icon-btn--xs"
          onClick={() => setConfirmGlobalReset(true)}
          disabled={item.disabled}
          title={t.settingsAgentRulesGlobalReset}
          aria-label={t.settingsAgentRulesGlobalReset}
        >
          <IconResetDefaults size={14} decorative />
        </button>
      </div>
      {value.sites.length > 0 ? (
        <div className="adl-agent-site-rules__sites">
          {value.sites.map((site) => {
            const origin = site.origin;
            const overridden = value.overrides.some((entry) => entry.origin === origin);
            return (
              <div className="adl-agent-site-rules__site-row" key={origin}>
                <button
                  type="button"
                  className="adl-agent-site-rules__site-label"
                  onClick={() => setDialog({ kind: 'site', origin })}
                  disabled={item.disabled}
                  title={origin}
                >
                  <span>{site.alias ? `${site.alias} · ${origin}` : origin}</span>
                  {overridden ? (
                    <small className="adl-agent-site-rules__overridden">
                      {t.settingsAgentRulesOverridden}
                    </small>
                  ) : null}
                </button>
                {overridden ? (
                  <button
                    type="button"
                    className="adl-icon-btn adl-icon-btn--xs"
                    onClick={() => setConfirmSiteReset(origin)}
                    disabled={item.disabled}
                    title={t.settingsAgentRulesSiteReset}
                    aria-label={`${t.settingsAgentRulesSiteReset} ${origin}`}
                  >
                    <IconResetDefaults size={14} decorative />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {dialog?.kind === 'global' ? (
        <div className="adl-prompt-modal" onClick={closeDialog}>
          <div
            className="adl-prompt-modal__panel adl-prompt-modal__panel--wide"
            role="dialog"
            aria-modal="true"
            aria-label={t.settingsAgentRulesDialogTitleGlobal}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="adl-prompt-modal__header">
              {t.settingsAgentRulesDialogTitleGlobal}
              <button
                type="button"
                className="adl-prompt-modal__header-close"
                onClick={closeDialog}
                aria-label={t.close}
              >
                ✕
              </button>
            </div>
            <div className="adl-prompt-modal__body">
              <RuleListEditor
                rules={globalDraft}
                setRules={setGlobalDraft}
                t={t}
                disabled={!!item.disabled}
              />
              <div className="adl-prompt-modal__actions">
                <button type="button" className="adl-btn adl-btn--secondary" onClick={closeDialog}>
                  {t.settingsAgentRulesCancel}
                </button>
                <button type="button" className="adl-btn adl-btn--primary" onClick={saveGlobal}>
                  {t.settingsAgentRulesSave}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {dialog?.kind === 'site' ? (
        <div className="adl-prompt-modal" onClick={closeDialog}>
          <div
            className="adl-prompt-modal__panel adl-prompt-modal__panel--wide"
            role="dialog"
            aria-modal="true"
            aria-label={formatT(t, 'settingsAgentRulesDialogTitleSite', {
              site: siteLabel(dialog.origin),
            })}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="adl-prompt-modal__header">
              {formatT(t, 'settingsAgentRulesDialogTitleSite', { site: siteLabel(dialog.origin) })}
              <button
                type="button"
                className="adl-prompt-modal__header-close"
                onClick={closeDialog}
                aria-label={t.close}
              >
                ✕
              </button>
            </div>
            <div className="adl-prompt-modal__body">
              <section className="adl-agent-site-rules__section">
                <div className="adl-agent-site-rules__section-title">
                  {t.settingsAgentRulesEnabled}
                </div>
                {value.rules.map((rule) => {
                  const checked = !disabledGlobalRuleIds.includes(rule.id);
                  return (
                    <label className="adl-agent-site-rules__rule-toggle" key={rule.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDisabledGlobal(rule.id)}
                        disabled={!!item.disabled}
                      />
                      <span>
                        {rule.id === 'builtin-file-like-attribute'
                          ? t.settingsAgentRulesBuiltinFileLike
                          : rule.name}
                      </span>
                    </label>
                  );
                })}
              </section>
              <section className="adl-agent-site-rules__section">
                <div className="adl-agent-site-rules__section-title">
                  {t.settingsAgentRulesSiteManage}
                </div>
                <RuleListEditor
                  rules={siteRules}
                  setRules={setSiteSpecificRules}
                  t={t}
                  disabled={!!item.disabled}
                />
              </section>
              <div className="adl-prompt-modal__actions">
                <button type="button" className="adl-btn adl-btn--secondary" onClick={closeDialog}>
                  {t.settingsAgentRulesCancel}
                </button>
                <button type="button" className="adl-btn adl-btn--primary" onClick={saveSite}>
                  {t.settingsAgentRulesSave}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmGlobalReset}
        title={t.settingsResetGroupConfirmTitle ?? t.settingsAgentRulesGlobalReset}
        message={formatT(t, 'settingsResetGroupConfirmMessage', { group: t.settingsAgentRules })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirmGlobalReset(false);
          onChange(item.id, { kind: 'resetGlobal' });
        }}
        onCancel={() => setConfirmGlobalReset(false)}
      />
      <ConfirmDialog
        open={confirmSiteReset !== null}
        title={t.settingsAgentRulesSiteReset}
        message={
          confirmSiteReset
            ? formatT(t, 'settingsAgentRulesSiteResetConfirm', {
                site: siteLabel(confirmSiteReset),
              })
            : ''
        }
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={() => {
          const origin = confirmSiteReset;
          setConfirmSiteReset(null);
          if (origin) {
            onChange(item.id, { kind: 'resetSite', origin });
          }
        }}
        onCancel={() => setConfirmSiteReset(null)}
      />
    </div>
  );
}
