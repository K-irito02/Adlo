import type { AgentSiteOverride, AgentSiteRule } from './ipc-types.generated';

export const BUILTIN_AGENT_SITE_RULE_ID = 'builtin-file-like-attribute';
export const DEFAULT_AGENT_SITE_MATCH_SELECTOR = 'button, a, [role="button"], [role="link"]';
export const DEFAULT_AGENT_SITE_ATTRIBUTES: string[] = [
  'title',
  'aria-label',
  'data-path',
  'data-file-path',
  'data-file',
  'data-url',
  'data-src',
];

/** XML Name 子集：`getAttribute` 对非法名字会抛 InvalidCharacterError。 */
const ATTRIBUTE_NAME_RE = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/;

export function defaultAgentSiteRules(): AgentSiteRule[] {
  return [
    {
      id: BUILTIN_AGENT_SITE_RULE_ID,
      name: BUILTIN_AGENT_SITE_RULE_ID,
      enabled: true,
      matchSelector: DEFAULT_AGENT_SITE_MATCH_SELECTOR,
      attributes: [...DEFAULT_AGENT_SITE_ATTRIBUTES],
      pathPreset: 'fileLike',
      action: 'file',
    },
  ];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value);
}

export function normalizeAgentSiteRules(rules: AgentSiteRule[] | undefined): AgentSiteRule[] {
  const seen = new Set<string>();
  const out: AgentSiteRule[] = [];
  for (const raw of rules ?? []) {
    if (!raw || typeof raw.id !== 'string') {
      continue;
    }
    const id = raw.id.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    const isRegex = raw.pathPreset === 'regex';
    const valueRegex =
      isRegex && typeof raw.valueRegex === 'string' ? raw.valueRegex.trim() : undefined;
    if (isRegex && !valueRegex) {
      continue;
    }
    if (valueRegex) {
      try {
        const flags = raw.regexFlags ?? '';
        RegExp(valueRegex, flags);
      } catch {
        continue;
      }
    }
    seen.add(id);
    const attributes: string[] = [];
    const attrSeen = new Set<string>();
    for (const attr of isStringArray(raw.attributes) ? raw.attributes : []) {
      const trimmed = attr.trim();
      if (!trimmed || attrSeen.has(trimmed) || !ATTRIBUTE_NAME_RE.test(trimmed)) {
        continue;
      }
      attrSeen.add(trimmed);
      attributes.push(trimmed);
    }
    out.push({
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
      enabled: raw.enabled !== false,
      matchSelector:
        typeof raw.matchSelector === 'string' && raw.matchSelector.trim()
          ? raw.matchSelector.trim()
          : DEFAULT_AGENT_SITE_MATCH_SELECTOR,
      attributes,
      pathPreset: isRegex ? 'regex' : 'fileLike',
      valueRegex,
      regexFlags: isRegex
        ? typeof raw.regexFlags === 'string' && raw.regexFlags.trim()
          ? raw.regexFlags.trim()
          : undefined
        : undefined,
      action: isRegex && raw.action === 'url' ? 'url' : 'file',
    });
  }
  return out;
}

export function normalizeAgentSiteOverrides(
  overrides: AgentSiteOverride[] | undefined,
): AgentSiteOverride[] {
  const seen = new Set<string>();
  const out: AgentSiteOverride[] = [];
  for (const raw of overrides ?? []) {
    if (!raw || typeof raw.origin !== 'string') {
      continue;
    }
    const origin = raw.origin.trim();
    if (!origin || seen.has(origin)) {
      continue;
    }
    seen.add(origin);
    const disabledRuleIds: string[] = [];
    const disabledSeen = new Set<string>();
    for (const id of isStringArray(raw.disabledRuleIds) ? raw.disabledRuleIds : []) {
      const trimmed = id.trim();
      if (!trimmed || disabledSeen.has(trimmed)) {
        continue;
      }
      disabledSeen.add(trimmed);
      disabledRuleIds.push(trimmed);
    }
    out.push({
      origin,
      disabledRuleIds,
      siteRules: normalizeAgentSiteRules(raw.siteRules),
    });
  }
  return out;
}

/**
 * 「拦截规则」是否已处于产品默认状态：全局规则等于内置默认集合，且没有任何
 * 有效的站点覆盖（空覆盖条目等同不存在，保存路径会丢弃它们）。
 * 行级恢复按钮据此置灰；顺序不同视为用户改动（不擅自判等）。
 */
export function isAgentSiteRulesAtDefault(
  rules: AgentSiteRule[] | undefined,
  overrides: AgentSiteOverride[] | undefined,
): boolean {
  const normalizedRules = normalizeAgentSiteRules(rules);
  if (JSON.stringify(normalizedRules) !== JSON.stringify(defaultAgentSiteRules())) {
    return false;
  }
  return normalizeAgentSiteOverrides(overrides).every(
    (entry) => entry.disabledRuleIds.length === 0 && entry.siteRules.length === 0,
  );
}
