import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentSiteOverride,
  AgentSiteRule,
  AgentSiteRulesCommand,
  AgentSiteRulesSettingValue,
  SettingItem,
  SettingValue,
} from '../../../kernel/types';
import type { CopyDict } from '../../i18n';
import { formatT } from '../../i18n';
import { copyToClipboard } from '../../i18n/copyToClipboard';
import {
  IconCheck,
  IconCircleHelp,
  IconCopy,
  IconDelete,
  IconPlus,
  IconResetDefaults,
} from '../../icons';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  agentSiteRulesBackupKey,
  clearAgentSiteRulesDraftBackup,
} from './agentSiteRulesDraftBackup';
import { HintCardTrigger } from '../HintCard';
import {
  BUILTIN_AGENT_SITE_RULE_ID,
  DEFAULT_AGENT_SITE_ATTRIBUTES,
  normalizeAgentSiteOverrides,
  normalizeAgentSiteRules,
} from '../../../shared/agentSiteRules';
import { buildAgentSiteRulesPrompt } from './agentSiteRulesPrompt';

type Scope = 'global' | 'site';

interface SiteDraft {
  rules: AgentSiteRule[];
  disabled: string[];
}

interface DraftBackup {
  base: string;
  globalDraft: AgentSiteRule[];
  siteDrafts: Record<string, SiteDraft>;
  /** 备份写入期间配置被外部改动：恢复时不得自动提交，等用户显式保存。 */
  externalChanged?: boolean;
}

const DEFAULT_SELECTOR = 'button, a, [role="button"], [role="link"]';
const EMPTY_SITE: SiteDraft = { rules: [], disabled: [] };

function cloneRules(rules: AgentSiteRule[]): AgentSiteRule[] {
  return rules.map((rule) => ({ ...rule, attributes: [...rule.attributes] }));
}

function readValue(item: SettingItem): AgentSiteRulesSettingValue {
  const raw = item.value as AgentSiteRulesCommand;
  const isValue = !raw || !('kind' in raw);
  if (!isValue) {
    return { rules: [], overrides: [], sites: [] };
  }
  const value = raw as AgentSiteRulesSettingValue;
  return {
    rules: value.rules ?? [],
    overrides: value.overrides ?? [],
    sites: value.sites ?? [],
  };
}

function buildSiteDrafts(value: AgentSiteRulesSettingValue): Record<string, SiteDraft> {
  const drafts: Record<string, SiteDraft> = {};
  for (const override of value.overrides) {
    drafts[override.origin] = {
      rules: cloneRules(coerceRules(override.siteRules)),
      disabled: [...override.disabledRuleIds],
    };
  }
  for (const site of value.sites) {
    if (!drafts[site.origin]) {
      drafts[site.origin] = { rules: [], disabled: [] };
    }
  }
  return drafts;
}

/** 固定字段顺序的规则签名：用于本地草稿的“是否有未保存修改”判定。 */
function ruleSignature(rules: AgentSiteRule[]): string {
  return JSON.stringify(
    rules.map((rule) => [
      rule.id,
      rule.name,
      rule.enabled,
      rule.matchSelector,
      rule.attributes,
      rule.pathPreset,
      rule.valueRegex ?? null,
      rule.regexFlags ?? null,
      rule.action,
    ]),
  );
}

function siteSignature(draft: SiteDraft | undefined): string {
  if (!draft) {
    return '[]';
  }
  return JSON.stringify([[...draft.disabled].sort(), ruleSignature(draft.rules)]);
}

/** 只比较非空站点覆盖：白名单增删站点本身不应该把草稿判成 dirty。 */
function sitesSignature(drafts: Record<string, SiteDraft>): string {
  return JSON.stringify(
    Object.keys(drafts)
      .sort()
      .filter((origin) => {
        const draft = drafts[origin];
        return draft && (draft.rules.length > 0 || draft.disabled.length > 0);
      })
      .map((origin) => [origin, siteSignature(drafts[origin])]),
  );
}

function configSignature(value: AgentSiteRulesSettingValue): string {
  return `${ruleSignature(value.rules)}|${sitesSignature(buildSiteDrafts(value))}`;
}

function coerceRules(raw: unknown): AgentSiteRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const rules: AgentSiteRule[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || typeof (entry as AgentSiteRule).id !== 'string') {
      continue;
    }
    const rule = entry as AgentSiteRule;
    rules.push({
      id: rule.id,
      name: typeof rule.name === 'string' && rule.name ? rule.name : rule.id,
      enabled: rule.enabled !== false,
      matchSelector:
        typeof rule.matchSelector === 'string' && rule.matchSelector
          ? rule.matchSelector
          : DEFAULT_SELECTOR,
      attributes: Array.isArray(rule.attributes)
        ? rule.attributes.filter((attr): attr is string => typeof attr === 'string')
        : [...DEFAULT_AGENT_SITE_ATTRIBUTES],
      pathPreset: rule.pathPreset === 'regex' ? 'regex' : 'fileLike',
      valueRegex: typeof rule.valueRegex === 'string' ? rule.valueRegex : undefined,
      regexFlags: typeof rule.regexFlags === 'string' ? rule.regexFlags : undefined,
      action: rule.pathPreset === 'regex' && rule.action === 'url' ? 'url' : 'file',
    });
  }
  return rules;
}

function coerceSiteDrafts(raw: unknown): Record<string, SiteDraft> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const drafts: Record<string, SiteDraft> = {};
  for (const [origin, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const draft = value as Partial<SiteDraft>;
    drafts[origin] = {
      rules: coerceRules(draft.rules),
      disabled: Array.isArray(draft.disabled)
        ? draft.disabled.filter((id): id is string => typeof id === 'string')
        : [],
    };
  }
  return drafts;
}

function backupKey(itemId: string): string {
  return agentSiteRulesBackupKey(itemId);
}

function loadBackup(itemId: string, value: AgentSiteRulesSettingValue): DraftBackup | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(backupKey(itemId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DraftBackup>;
    if (!parsed || parsed.base !== configSignature(value)) {
      localStorage.removeItem(backupKey(itemId));
      return null;
    }
    const allowed = new Set(value.sites.map((site) => site.origin));
    const restoredSites = coerceSiteDrafts(parsed.siteDrafts);
    const siteDrafts: Record<string, SiteDraft> = {};
    for (const [origin, draft] of Object.entries(restoredSites)) {
      if (allowed.has(origin)) {
        siteDrafts[origin] = draft;
      }
    }
    return {
      base: parsed.base,
      globalDraft: coerceRules(parsed.globalDraft),
      siteDrafts,
      externalChanged: parsed.externalChanged === true,
    };
  } catch {
    return null;
  }
}

function writeBackup(itemId: string, backup: DraftBackup): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(backupKey(itemId), JSON.stringify(backup));
  } catch {
    // 草稿备份失败不应影响编辑；持久化保存仍走 onChange。
  }
}

function clearBackup(itemId: string): void {
  clearAgentSiteRulesDraftBackup(itemId);
}

function buildOverrides(
  drafts: Record<string, SiteDraft>,
  globalRules: AgentSiteRule[],
  allowedOrigins: string[],
): AgentSiteOverride[] {
  const allowed = new Set(allowedOrigins);
  const ruleIds = new Set(globalRules.map((rule) => rule.id));
  const overrides: AgentSiteOverride[] = [];
  for (const [origin, draft] of Object.entries(drafts)) {
    if (!allowed.has(origin)) {
      continue;
    }
    const disabled = draft.disabled.filter((id) => ruleIds.has(id));
    if (disabled.length === 0 && draft.rules.length === 0) {
      continue;
    }
    overrides.push({
      origin,
      disabledRuleIds: disabled,
      siteRules: cloneRules(draft.rules),
    });
  }
  return normalizeAgentSiteOverrides(overrides);
}

function buildDraftsFromOverrides(
  overrides: AgentSiteOverride[],
  sites: AgentSiteRulesSettingValue['sites'],
): Record<string, SiteDraft> {
  const drafts: Record<string, SiteDraft> = {};
  for (const site of sites) {
    drafts[site.origin] = { rules: [], disabled: [] };
  }
  for (const override of overrides) {
    if (!drafts[override.origin]) {
      continue;
    }
    drafts[override.origin] = {
      rules: cloneRules(coerceRules(override.siteRules)),
      disabled: [...override.disabledRuleIds],
    };
  }
  return drafts;
}

function createRule(t: CopyDict): AgentSiteRule {
  return {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: t.settingsAgentRulesAdd,
    enabled: true,
    matchSelector: DEFAULT_SELECTOR,
    attributes: [...DEFAULT_AGENT_SITE_ATTRIBUTES],
    pathPreset: 'fileLike',
    action: 'file',
  };
}

function isRuleInvalid(rule: AgentSiteRule): boolean {
  if (rule.pathPreset !== 'regex') {
    return false;
  }
  if (!rule.valueRegex) {
    return true;
  }
  try {
    // 与保存路径同口径：flags 非法也必须阻断，否则 normalize 会静默丢弃整条规则。
    RegExp(rule.valueRegex, rule.regexFlags ?? '');
    return false;
  } catch {
    return true;
  }
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`adl-agent-rules__switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="adl-agent-rules__switch-thumb" />
    </button>
  );
}

/**
 * 「拦截规则」行内工作台（方案 A）。
 *
 * 两个 tab 共享同一份草稿：全局 tab 的改动立即出现在站点 tab 的「全局启用规则」里；
 * 保存一次提交整个工作台，取消一次丢弃整个工作台。未保存内容在离开面板/关闭应用
 * 时自动提交，并在 localStorage 留一份可恢复草稿，避免切换面板或崩溃丢编辑。
 */
export function AgentSiteRulesPanel({
  item,
  t,
  onChange,
  onClose,
  suppressAutoSave,
}: {
  item: SettingItem;
  t: CopyDict;
  onChange: (id: string, value: SettingValue) => void;
  onClose: () => void;
  /** 父层执行结构性重置时置位：卸载不提交旧草稿，并清掉本地备份。 */
  suppressAutoSave?: { current: boolean };
}) {
  const value = useMemo(() => readValue(item), [item]);
  const [restored] = useState(() => loadBackup(item.id, value));
  const [scope, setScope] = useState<Scope>('global');
  const [site, setSite] = useState(() => {
    const restoredSite = restored ? Object.keys(restored.siteDrafts)[0] : undefined;
    return restoredSite ?? value.sites[0]?.origin ?? '';
  });
  const [globalDraft, setGlobalDraft] = useState<AgentSiteRule[]>(() =>
    cloneRules(restored?.globalDraft ?? coerceRules(value.rules)),
  );
  const [siteDrafts, setSiteDrafts] = useState<Record<string, SiteDraft>>(() => {
    if (!restored) {
      return buildSiteDrafts(value);
    }
    const merged = buildSiteDrafts(value);
    for (const [origin, draft] of Object.entries(restored.siteDrafts)) {
      if (merged[origin]) {
        merged[origin] = draft;
      }
    }
    return merged;
  });
  const [baselineGlobal, setBaselineGlobal] = useState<AgentSiteRule[]>(() =>
    cloneRules(coerceRules(value.rules)),
  );
  const [baselineSites, setBaselineSites] = useState<Record<string, SiteDraft>>(() =>
    buildSiteDrafts(value),
  );
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [attributesText, setAttributesText] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [externalConfigChanged, setExternalConfigChanged] = useState(
    restored?.externalChanged === true,
  );
  const [confirmSiteReset, setConfirmSiteReset] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);
  const hasEditedRef = useRef(restored !== null);
  const discardRef = useRef(false);
  const autoSaveRef = useRef<() => void>(() => undefined);
  const lastAutoSaveRef = useRef('');
  const canSaveRef = useRef(true);
  const lastValueSignatureRef = useRef(configSignature(value));
  const tabRefs = useRef<Record<Scope, HTMLButtonElement | null>>({
    global: null,
    site: null,
  });

  const firstSite = value.sites[0]?.origin ?? '';
  const siteExists = value.sites.some((entry) => entry.origin === site);
  useEffect(() => {
    if (!siteExists && site !== firstSite) {
      setSite(firstSite);
    }
  }, [firstSite, site, siteExists]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }
    },
    [],
  );

  const activeSiteDraft: SiteDraft = siteDrafts[site] ?? EMPTY_SITE;
  const activeRules = scope === 'global' ? globalDraft : activeSiteDraft.rules;
  const activeDisabled = scope === 'global' ? [] : activeSiteDraft.disabled;
  const selectionKey = scope === 'global' ? 'global' : `site:${site}`;
  const selectedRule =
    activeRules.find((rule) => rule.id === selection[selectionKey]) ?? activeRules[0] ?? null;
  const selectedRuleId = selectedRule?.id ?? '';

  const globalDirty = ruleSignature(globalDraft) !== ruleSignature(baselineGlobal);
  const activeSiteDirty =
    siteSignature(activeSiteDraft) !== siteSignature(baselineSites[site] ?? EMPTY_SITE);
  const allSitesDirty = sitesSignature(siteDrafts) !== sitesSignature(baselineSites);
  const footerVisible = scope === 'global' ? globalDirty : activeSiteDirty;

  useEffect(() => {
    setAttributesText(selectedRule ? selectedRule.attributes.join(', ') : '');
    // 只在选中项/作用域切换时回填原始文本；依赖规则数组会让用户每敲一个逗号
    // 都被 join 覆盖（历史回归：属性列表无法输入逗号）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRuleId, scope, site]);

  const markEdited = useCallback(() => {
    hasEditedRef.current = true;
  }, []);

  const setActiveRules = useCallback(
    (updater: (rules: AgentSiteRule[]) => AgentSiteRule[]) => {
      markEdited();
      if (scope === 'global') {
        setGlobalDraft(updater);
        return;
      }
      setSiteDrafts((prev) => {
        const current = prev[site] ?? EMPTY_SITE;
        return { ...prev, [site]: { ...current, rules: updater(current.rules) } };
      });
    },
    [markEdited, scope, site],
  );

  const updateSelected = useCallback(
    (patch: Partial<AgentSiteRule>) => {
      if (!selectedRule) {
        return;
      }
      const targetId = selectedRule.id;
      setActiveRules((rules) =>
        rules.map((rule) => (rule.id === targetId ? { ...rule, ...patch } : rule)),
      );
    },
    [selectedRule, setActiveRules],
  );

  const setActiveDisabled = useCallback(
    (updater: (disabled: string[]) => string[]) => {
      markEdited();
      setSiteDrafts((prev) => {
        const current = prev[site] ?? EMPTY_SITE;
        return { ...prev, [site]: { ...current, disabled: updater(current.disabled) } };
      });
    },
    [markEdited, site],
  );

  const selectRule = (ruleId: string) => {
    setSelection((prev) => ({ ...prev, [selectionKey]: ruleId }));
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const next: Scope = event.key === 'ArrowLeft' || event.key === 'Home' ? 'global' : 'site';
    setScope(next);
    tabRefs.current[next]?.focus();
  };

  const addRule = () => {
    const next = createRule(t);
    setActiveRules((rules) => [...rules, next]);
    setSelection((prev) => ({ ...prev, [selectionKey]: next.id }));
  };

  const deleteSelected = () => {
    if (!selectedRule) {
      return;
    }
    const next = activeRules.filter((rule) => rule.id !== selectedRule.id);
    setActiveRules(() => next);
    setSelection((prev) => ({ ...prev, [selectionKey]: next[0]?.id ?? '' }));
  };

  const toggleRule = (ruleId: string) => {
    setActiveRules((rules) =>
      rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule)),
    );
  };

  const toggleGlobalRule = (ruleId: string) => {
    setActiveDisabled((disabled) =>
      disabled.includes(ruleId) ? disabled.filter((id) => id !== ruleId) : [...disabled, ruleId],
    );
  };

  const buildPayload = useCallback(
    (globalRules: AgentSiteRule[], drafts: Record<string, SiteDraft>) => {
      const nextGlobal = normalizeAgentSiteRules(globalRules);
      const nextOverrides = buildOverrides(
        drafts,
        nextGlobal,
        value.sites.map((entry) => entry.origin),
      );
      return {
        rules: nextGlobal,
        overrides: normalizeAgentSiteOverrides(nextOverrides),
        sites: value.sites,
      };
    },
    [value.sites],
  );

  const canSave =
    globalDraft.every((rule) => !isRuleInvalid(rule)) &&
    Object.values(siteDrafts).every((draft) => draft.rules.every((rule) => !isRuleInvalid(rule)));
  canSaveRef.current = canSave;
  const selectedInvalid = selectedRule !== null && isRuleInvalid(selectedRule);

  const save = () => {
    if (!canSave || !footerVisible) {
      return;
    }
    const payload = buildPayload(globalDraft, siteDrafts);
    onChange(item.id, payload);
    lastAutoSaveRef.current = JSON.stringify(payload);
    const nextSites = buildDraftsFromOverrides(payload.overrides, value.sites);
    setGlobalDraft(cloneRules(payload.rules));
    setSiteDrafts(nextSites);
    setBaselineGlobal(cloneRules(payload.rules));
    setBaselineSites(nextSites);
    hasEditedRef.current = true;
    setExternalConfigChanged(false);
  };

  const discard = () => {
    discardRef.current = true;
    clearBackup(item.id);
    onClose();
  };

  const currentSite = value.sites.find((entry) => entry.origin === site);

  const handleCopyPrompt = async () => {
    const prompt = buildAgentSiteRulesPrompt({
      t,
      scope,
      site,
      siteAlias: currentSite?.alias,
      value: {
        ...value,
        rules: globalDraft,
        overrides: buildOverrides(
          siteDrafts,
          globalDraft,
          value.sites.map((entry) => entry.origin),
        ),
      },
    });
    const result = await copyToClipboard(prompt);
    setCopyState(result.ok ? 'ok' : 'error');
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 1800);
  };

  const resetSiteOverride = (origin: string) => {
    onChange(item.id, { kind: 'resetSite', origin });
    markEdited();
    setSiteDrafts((prev) => ({ ...prev, [origin]: { rules: [], disabled: [] } }));
    setBaselineSites((prev) => ({ ...prev, [origin]: { rules: [], disabled: [] } }));
    setConfirmSiteReset(null);
  };

  const displayName = (rule: AgentSiteRule) =>
    rule.id === BUILTIN_AGENT_SITE_RULE_ID ? t.settingsAgentRulesBuiltinFileLike : rule.name;

  // 恢复草稿：先写回应用配置，避免用户再次关闭时丢失；随后由 value 同步清掉 dirty。
  useEffect(() => {
    if (!restored) {
      return;
    }
    // 外部已改配置：不自动用草稿覆盖，等用户在面板里显式保存。
    if (externalConfigChanged) {
      return;
    }
    // 非法正则等不可保存状态：与自动保存同口径，保留草稿等用户修正。
    if (!canSaveRef.current) {
      return;
    }
    const payload = buildPayload(globalDraft, siteDrafts);
    const dirty =
      ruleSignature(globalDraft) !== ruleSignature(value.rules) ||
      sitesSignature(siteDrafts) !== sitesSignature(buildSiteDrafts(value));
    if (!dirty) {
      return;
    }
    onChange(item.id, payload);
    // 立即把基线推进到刚提交的 payload：否则父层 config 回流会被误判为
    // 「外部变更」，阻断本会话后续自动保存。
    lastAutoSaveRef.current = JSON.stringify(payload);
    const nextSites = buildDraftsFromOverrides(payload.overrides, value.sites);
    setGlobalDraft(cloneRules(payload.rules));
    setSiteDrafts(nextSites);
    setBaselineGlobal(cloneRules(payload.rules));
    setBaselineSites(nextSites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保存成功后父层 config 会异步回流：草稿与最新值一致时把基线同步过去，隐藏页脚。
  useEffect(() => {
    const nextGlobal = value.rules;
    if (
      ruleSignature(globalDraft) === ruleSignature(nextGlobal) &&
      ruleSignature(baselineGlobal) !== ruleSignature(nextGlobal)
    ) {
      setBaselineGlobal(cloneRules(nextGlobal));
    }
    const nextSites = buildSiteDrafts(value);
    if (
      sitesSignature(siteDrafts) === sitesSignature(nextSites) &&
      sitesSignature(baselineSites) !== sitesSignature(nextSites)
    ) {
      setBaselineSites(nextSites);
    }
  }, [value, globalDraft, siteDrafts, baselineGlobal, baselineSites]);

  // 面板打开期间 config 被外部改动（watcher 热重载 / 外部 Agent 按提示词直改）：
  // - 干净作用域（草稿 == 旧配置）直接采纳新配置；
  // - 有草稿则保留草稿并阻断卸载自动提交，避免用旧快照覆盖外部写入。
  useEffect(() => {
    const nextSignature = configSignature(value);
    if (nextSignature === lastValueSignatureRef.current) {
      return;
    }
    lastValueSignatureRef.current = nextSignature;
    if (globalDirty || allSitesDirty) {
      setExternalConfigChanged(true);
      // 同一会话内可能连续外部变更多次；state 已为 true 时不会再触发备份 effect，
      // 这里直接用新签名重写备份，避免重开时 base 不匹配而丢草稿。
      writeBackup(item.id, {
        base: nextSignature,
        globalDraft,
        siteDrafts,
        externalChanged: true,
      });
      return;
    }
    setExternalConfigChanged(false);
    const nextGlobal = cloneRules(value.rules);
    const nextSites = buildSiteDrafts(value);
    setGlobalDraft(nextGlobal);
    setSiteDrafts(nextSites);
    setBaselineGlobal(cloneRules(nextGlobal));
    setBaselineSites(nextSites);
  }, [value, globalDirty, allSitesDirty, globalDraft, item.id, siteDrafts]);

  // 任何改动都写一份本地草稿；保存/回填后（不再 dirty）立刻清除，避免
  // 「保存 → 行级恢复默认 → 重开面板」时旧草稿复活并覆盖重置。
  useEffect(() => {
    if (!hasEditedRef.current || discardRef.current || suppressAutoSave?.current) {
      return;
    }
    if (!globalDirty && !allSitesDirty) {
      clearBackup(item.id);
      return;
    }
    writeBackup(item.id, {
      base: lastValueSignatureRef.current,
      globalDraft,
      siteDrafts,
      externalChanged: externalConfigChanged,
    });
  }, [
    globalDirty,
    allSitesDirty,
    globalDraft,
    item.id,
    siteDrafts,
    suppressAutoSave,
    externalConfigChanged,
  ]);

  // 离开面板（切换设置组/右侧面板/关闭应用）时静默提交未保存内容。
  autoSaveRef.current = () => {
    if (discardRef.current || suppressAutoSave?.current) {
      return;
    }
    if (!globalDirty && !allSitesDirty) {
      return;
    }
    // 非法正则等不可保存状态：保留备份，等用户回到面板处理，禁止静默丢弃。
    if (!canSaveRef.current) {
      return;
    }
    // 外部已改配置：不自动覆盖外部写入。草稿留在备份里，下次打开显式提交。
    if (externalConfigChanged) {
      return;
    }
    const payload = buildPayload(globalDraft, siteDrafts);
    const signature = JSON.stringify(payload);
    if (signature === lastAutoSaveRef.current) {
      return;
    }
    lastAutoSaveRef.current = signature;
    onChange(item.id, payload);
  };

  useEffect(() => {
    const suppressRef = suppressAutoSave;
    const itemId = item.id;
    const handleBeforeUnload = () => autoSaveRef.current();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (suppressRef?.current) {
        clearBackup(itemId);
        return;
      }
      autoSaveRef.current();
    };
  }, [item.id, suppressAutoSave]);

  const helpTitle =
    scope === 'global' ? t.settingsAgentRulesHelpGlobalTitle : t.settingsAgentRulesHelpSiteTitle;
  const helpVars = {
    intercept: t.settingsAgentIntercept,
    whitelist: t.settingsAgentWhitelist,
    selector: t.settingsAgentRulesSelector,
    attributes: t.settingsAgentRulesAttributes,
    preset: t.settingsAgentRulesPreset,
    fileLike: t.settingsAgentRulesPresetFileLike,
    regex: t.settingsAgentRulesPresetRegex,
    siteTab: t.settingsAgentRulesSiteTab,
    globalEnabled: t.settingsAgentRulesGlobalEnabled,
  };
  const helpIntro = formatT(
    t,
    scope === 'global' ? 'settingsAgentRulesHelpGlobalIntro' : 'settingsAgentRulesHelpSiteIntro',
    helpVars,
  );
  const helpSteps =
    scope === 'global'
      ? (
          [
            'settingsAgentRulesHelpGlobalStep1',
            'settingsAgentRulesHelpGlobalStep2',
            'settingsAgentRulesHelpGlobalStep3',
          ] as const
        ).map((key) => formatT(t, key, helpVars))
      : (
          [
            'settingsAgentRulesHelpSiteStep1',
            'settingsAgentRulesHelpSiteStep2',
            'settingsAgentRulesHelpSiteStep3',
          ] as const
        ).map((key) => formatT(t, key, helpVars));
  const helpNote = formatT(t, 'settingsAgentRulesHelpNote', helpVars);
  const emptyHint =
    scope === 'global' ? t.settingsAgentRulesEmptyGlobal : t.settingsAgentRulesEmptySite;

  const helpContent = (
    <div className="adl-agent-rules__hint">
      <div className="adl-agent-rules__hint-title">{helpTitle}</div>
      <p className="adl-agent-rules__hint-intro">{helpIntro}</p>
      <ol className="adl-agent-rules__hint-steps">
        {helpSteps.map((step, index) => (
          <li key={step}>
            <span className="adl-agent-rules__hint-index">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="adl-agent-rules__hint-grid">
        <div>
          <span className="adl-agent-rules__badge">{t.settingsAgentRulesPresetFileLike}</span>
          <p>{t.settingsAgentRulesHelpFileLike}</p>
        </div>
        <div>
          <span className="adl-agent-rules__badge">{t.settingsAgentRulesPresetRegex}</span>
          <p>{t.settingsAgentRulesHelpRegex}</p>
        </div>
      </div>
      <p className="adl-agent-rules__hint-note">{helpNote}</p>
    </div>
  );

  return (
    <section
      className="adl-agent-rules"
      id="adl-agent-site-rules-panel"
      aria-label={t.settingsAgentRules}
    >
      <header className="adl-agent-rules__header">
        <div className="adl-agent-rules__tabs" role="tablist" aria-label={t.settingsAgentRules}>
          <button
            ref={(element) => {
              tabRefs.current.global = element;
            }}
            type="button"
            role="tab"
            id="adl-agent-rules-tab-global"
            aria-selected={scope === 'global'}
            aria-controls="adl-agent-rules-tabpanel"
            tabIndex={scope === 'global' ? 0 : -1}
            className={`adl-agent-rules__tab${scope === 'global' ? ' is-active' : ''}`}
            onClick={() => setScope('global')}
            onKeyDown={handleTabKeyDown}
            disabled={item.disabled}
          >
            {t.settingsAgentRulesGlobalTab}
          </button>
          <button
            ref={(element) => {
              tabRefs.current.site = element;
            }}
            type="button"
            role="tab"
            id="adl-agent-rules-tab-site"
            aria-selected={scope === 'site'}
            aria-controls="adl-agent-rules-tabpanel"
            tabIndex={scope === 'site' ? 0 : -1}
            className={`adl-agent-rules__tab${scope === 'site' ? ' is-active' : ''}`}
            onClick={() => setScope('site')}
            onKeyDown={handleTabKeyDown}
            disabled={item.disabled}
          >
            {t.settingsAgentRulesSiteTab}
          </button>
        </div>
        <div className="adl-agent-rules__header-actions">
          <button
            type="button"
            className="adl-agent-rules__text-btn"
            data-copy-state={copyState}
            onClick={() => void handleCopyPrompt()}
            title={t.settingsAgentRulesCopyPrompt}
            aria-label={t.settingsAgentRulesCopyPrompt}
          >
            {copyState === 'ok' ? (
              <IconCheck size={14} decorative />
            ) : (
              <IconCopy size={14} decorative />
            )}
            <span className="adl-agent-rules__copy-full">
              {copyState === 'ok'
                ? t.settingsAgentRulesCopied
                : copyState === 'error'
                  ? t.settingsAgentRulesCopyFailed
                  : t.settingsAgentRulesCopyPrompt}
            </span>
            <span className="adl-agent-rules__copy-short">
              {copyState === 'ok'
                ? t.settingsAgentRulesCopied
                : copyState === 'error'
                  ? t.settingsAgentRulesCopyFailedShort
                  : t.settingsAgentRulesCopyPromptShort}
            </span>
            {/* 常驻无障碍状态：窄容器隐藏上述文案时仍能朗读复制结果。 */}
            <span className="sr-only" role="status" aria-live="polite">
              {copyState === 'ok'
                ? t.settingsAgentRulesCopied
                : copyState === 'error'
                  ? t.settingsAgentRulesCopyFailed
                  : ''}
            </span>
          </button>
          <button
            type="button"
            className="adl-agent-rules__icon-btn"
            onClick={onClose}
            aria-label={t.close}
            title={t.close}
          >
            ✕
          </button>
        </div>
      </header>

      <div
        role="tabpanel"
        id="adl-agent-rules-tabpanel"
        aria-labelledby={
          scope === 'global' ? 'adl-agent-rules-tab-global' : 'adl-agent-rules-tab-site'
        }
      >
        {scope === 'site' && value.sites.length > 0 && (
          <div className="adl-agent-rules__sites">
            <span className="adl-agent-rules__sites-label">{t.settingsAgentRulesSiteTab}</span>
            <div className="adl-agent-rules__sites-list">
              {value.sites.map((entry) => {
                const hasOverride = value.overrides.some(
                  (override) =>
                    override.origin === entry.origin &&
                    (override.disabledRuleIds.length > 0 || override.siteRules.length > 0),
                );
                const label = entry.alias ? `${entry.alias} · ${entry.origin}` : entry.origin;
                return (
                  <span
                    key={entry.origin}
                    className={`adl-agent-rules__site${entry.origin === site ? ' is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="adl-agent-rules__site-btn"
                      onClick={() => setSite(entry.origin)}
                      title={label}
                      aria-pressed={entry.origin === site}
                    >
                      {entry.alias || entry.origin}
                    </button>
                    {hasOverride && (
                      <button
                        type="button"
                        className="adl-agent-rules__icon-btn adl-agent-rules__site-reset"
                        onClick={() => setConfirmSiteReset(entry.origin)}
                        title={t.settingsAgentRulesSiteReset}
                        aria-label={`${t.settingsAgentRulesSiteReset} ${label}`}
                      >
                        <IconResetDefaults size={12} decorative />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {scope === 'site' && value.sites.length === 0 ? (
          <div className="adl-agent-rules__empty adl-agent-rules__empty--sites">
            <strong>{t.settingsAgentRulesNoSites}</strong>
            <p>{t.settingsAgentRulesNoSitesHint}</p>
          </div>
        ) : (
          <div className="adl-agent-rules__body">
            <div className="adl-agent-rules__rail">
              <div className="adl-agent-rules__rail-head">
                <HintCardTrigger content={helpContent}>
                  <button
                    type="button"
                    className="adl-agent-rules__icon-btn"
                    title={t.settingsAgentRulesHelpShow}
                    aria-label={t.settingsAgentRulesHelpShow}
                  >
                    <IconCircleHelp size={14} decorative />
                  </button>
                </HintCardTrigger>
                <span className="adl-agent-rules__rail-title">
                  {scope === 'global'
                    ? t.settingsAgentRulesGlobalTab
                    : t.settingsAgentRulesSiteRules}
                </span>
                <div className="adl-agent-rules__rail-tools">
                  <button
                    type="button"
                    className="adl-agent-rules__icon-btn"
                    onClick={addRule}
                    disabled={item.disabled}
                    aria-label={t.settingsAgentRulesAdd}
                    title={t.settingsAgentRulesAdd}
                  >
                    <IconPlus size={14} decorative />
                  </button>
                  <button
                    type="button"
                    className="adl-agent-rules__icon-btn"
                    onClick={deleteSelected}
                    disabled={!selectedRule || item.disabled}
                    aria-label={t.settingsAgentRulesDeleteSelected}
                    title={t.settingsAgentRulesDeleteSelected}
                  >
                    <IconDelete size={14} decorative />
                  </button>
                </div>
              </div>
              <div className="adl-agent-rules__rules">
                {activeRules.length === 0 ? (
                  <p className="adl-agent-rules__empty-hint">{emptyHint}</p>
                ) : (
                  activeRules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`adl-agent-rules__rule${rule.id === selectedRule?.id ? ' is-selected' : ''}`}
                    >
                      <Toggle
                        checked={rule.enabled}
                        onChange={() => toggleRule(rule.id)}
                        label={`${displayName(rule)} — ${t.settingsAgentRulesEnabled}`}
                        disabled={item.disabled}
                      />
                      <button
                        type="button"
                        className="adl-agent-rules__rule-main"
                        onClick={() => selectRule(rule.id)}
                        disabled={item.disabled}
                      >
                        <span className="adl-agent-rules__rule-name">{displayName(rule)}</span>
                        <span className="adl-agent-rules__rule-meta">
                          {rule.pathPreset === 'regex'
                            ? t.settingsAgentRulesPresetRegex
                            : t.settingsAgentRulesPresetFileLike}
                        </span>
                      </button>
                    </div>
                  ))
                )}
              </div>
              {scope === 'site' && globalDraft.length > 0 && (
                <div className="adl-agent-rules__global-toggles">
                  <div className="adl-agent-rules__rail-subhead">
                    {t.settingsAgentRulesGlobalEnabled}
                  </div>
                  {globalDraft.map((rule) => (
                    <div key={rule.id} className="adl-agent-rules__toggle-row">
                      <span className="adl-agent-rules__toggle-label" title={displayName(rule)}>
                        {displayName(rule)}
                      </span>
                      <Toggle
                        checked={!activeDisabled.includes(rule.id)}
                        onChange={() => toggleGlobalRule(rule.id)}
                        label={displayName(rule)}
                        disabled={item.disabled}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="adl-agent-rules__editor">
              {selectedRule ? (
                <>
                  <div className="adl-agent-rules__field">
                    <label htmlFor="adl-rules-name">{t.settingsAgentRulesName}</label>
                    <input
                      id="adl-rules-name"
                      value={selectedRule.name}
                      onChange={(event) => updateSelected({ name: event.currentTarget.value })}
                      autoComplete="off"
                      disabled={item.disabled}
                    />
                  </div>
                  <div className="adl-agent-rules__field">
                    <label htmlFor="adl-rules-selector">{t.settingsAgentRulesSelector}</label>
                    <input
                      id="adl-rules-selector"
                      value={selectedRule.matchSelector}
                      onChange={(event) =>
                        updateSelected({ matchSelector: event.currentTarget.value })
                      }
                      autoComplete="off"
                      spellCheck={false}
                      disabled={item.disabled}
                    />
                  </div>
                  <div className="adl-agent-rules__field">
                    <label htmlFor="adl-rules-attrs">{t.settingsAgentRulesAttributes}</label>
                    <input
                      id="adl-rules-attrs"
                      value={attributesText}
                      onChange={(event) => {
                        const text = event.currentTarget.value;
                        setAttributesText(text);
                        updateSelected({
                          attributes: text
                            .split(',')
                            .map((entry) => entry.trim())
                            .filter(Boolean),
                        });
                      }}
                      placeholder={t.settingsAgentRulesAttributesHint}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={item.disabled}
                    />
                    <small>{t.settingsAgentRulesAttributesHint}</small>
                  </div>
                  <div className="adl-agent-rules__row">
                    <div className="adl-agent-rules__field">
                      <label htmlFor="adl-rules-preset">{t.settingsAgentRulesPreset}</label>
                      <select
                        id="adl-rules-preset"
                        value={selectedRule.pathPreset}
                        onChange={(event) => {
                          const pathPreset = event.currentTarget.value as 'fileLike' | 'regex';
                          updateSelected(
                            pathPreset === 'fileLike'
                              ? {
                                  pathPreset,
                                  valueRegex: undefined,
                                  regexFlags: undefined,
                                  action: 'file',
                                }
                              : { pathPreset },
                          );
                        }}
                        disabled={item.disabled}
                      >
                        <option value="fileLike">{t.settingsAgentRulesPresetFileLike}</option>
                        <option value="regex">{t.settingsAgentRulesPresetRegex}</option>
                      </select>
                    </div>
                    <div className="adl-agent-rules__field">
                      <label htmlFor="adl-rules-action">{t.settingsAgentRulesAction}</label>
                      <select
                        id="adl-rules-action"
                        value={selectedRule.action}
                        onChange={(event) =>
                          updateSelected({
                            action: event.currentTarget.value as 'file' | 'url',
                          })
                        }
                        disabled={item.disabled || selectedRule.pathPreset === 'fileLike'}
                      >
                        <option value="file">{t.settingsAgentRulesActionFile}</option>
                        <option value="url">{t.settingsAgentRulesActionUrl}</option>
                      </select>
                      {selectedRule.pathPreset === 'fileLike' && (
                        <small className="adl-agent-rules__field-hint">
                          {t.settingsAgentRulesActionFileOnly}
                        </small>
                      )}
                    </div>
                  </div>
                  {selectedRule.pathPreset === 'regex' && (
                    <>
                      <div className="adl-agent-rules__row">
                        <div className="adl-agent-rules__field">
                          <label htmlFor="adl-rules-regex">{t.settingsAgentRulesRegex}</label>
                          <input
                            id="adl-rules-regex"
                            value={selectedRule.valueRegex ?? ''}
                            onChange={(event) =>
                              updateSelected({ valueRegex: event.currentTarget.value })
                            }
                            autoComplete="off"
                            spellCheck={false}
                            disabled={item.disabled}
                            aria-invalid={selectedInvalid}
                            className={selectedInvalid ? 'is-invalid' : undefined}
                          />
                        </div>
                        <div className="adl-agent-rules__field">
                          <label htmlFor="adl-rules-flags">{t.settingsAgentRulesRegexFlags}</label>
                          <input
                            id="adl-rules-flags"
                            value={selectedRule.regexFlags ?? ''}
                            onChange={(event) =>
                              updateSelected({ regexFlags: event.currentTarget.value })
                            }
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="i"
                            disabled={item.disabled}
                          />
                        </div>
                      </div>
                      {selectedInvalid && (
                        <p className="adl-agent-rules__error">{t.settingsAgentRulesRuleError}</p>
                      )}
                    </>
                  )}
                  <div className="adl-agent-rules__toggle-row adl-agent-rules__toggle-row--editor">
                    <span className="adl-agent-rules__toggle-label">
                      {t.settingsAgentRulesEnabled}
                    </span>
                    <Toggle
                      checked={selectedRule.enabled}
                      onChange={(next) => updateSelected({ enabled: next })}
                      label={`${displayName(selectedRule)} — ${t.settingsAgentRulesEnabled}`}
                      disabled={item.disabled}
                    />
                  </div>
                </>
              ) : (
                <div className="adl-agent-rules__empty">
                  <strong>{emptyHint}</strong>
                  <p>{helpNote}</p>
                </div>
              )}
              {footerVisible && (
                <div className="adl-agent-rules__footer">
                  <span className="adl-agent-rules__footer-hint">
                    {externalConfigChanged
                      ? t.settingsAgentRulesExternalChanged
                      : !canSave && !selectedInvalid
                        ? t.settingsAgentRulesOtherRuleInvalid
                        : ''}
                  </span>
                  <button type="button" className="adl-agent-rules__btn" onClick={discard}>
                    {t.settingsAgentRulesCancel}
                  </button>
                  <button
                    type="button"
                    className="adl-agent-rules__btn adl-agent-rules__btn--primary"
                    onClick={save}
                    disabled={!canSave || item.disabled}
                  >
                    {t.settingsAgentRulesSave}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmSiteReset !== null}
        title={t.settingsAgentRulesSiteReset}
        message={
          confirmSiteReset
            ? formatT(t, 'settingsAgentRulesSiteResetConfirm', {
                site:
                  value.sites.find((entry) => entry.origin === confirmSiteReset)?.alias ??
                  confirmSiteReset,
              })
            : ''
        }
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={() => {
          if (confirmSiteReset) {
            resetSiteOverride(confirmSiteReset);
          }
        }}
        onCancel={() => setConfirmSiteReset(null)}
      />
    </section>
  );
}
