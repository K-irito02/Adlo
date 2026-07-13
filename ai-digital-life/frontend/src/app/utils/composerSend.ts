import type { ChatMode, ContextChip } from '../stores/types';
import type { Locale } from '../i18n';
import { loadLocale } from '../i18n/i18nLoader';

export interface MessageSendOptions {
  mode?: ChatMode;
  chips?: ContextChip[];
  locale?: Locale;
}

/** Maps UI 规划/问答/调试 to backend `ConversationScenario`. */
export function chatModeToScenario(mode: ChatMode): 'chat' | 'plan' | 'code-edit' {
  if (mode === 'plan') {
    return 'plan';
  }
  if (mode === 'ask') {
    return 'chat';
  }
  return 'code-edit';
}

/** 将上下文 chip 以低优先级附注形式拼入用户内容（符合「外部材料」与方案中的 reference-material 分层）。 */
export async function augmentPromptWithChips(
  content: string,
  chips: ContextChip[] | undefined,
  locale: Locale = 'zh-CN'
): Promise<string> {
  if (!chips?.length) {
    return content;
  }
  const lines = chips.map((c) => {
    const detail = c.detail ? ` — ${c.detail}` : '';
    return `- [${c.kind}] ${c.label}${detail}`;
  });
  const t = await loadLocale(locale);
  const prefix = t.composerContextPrefix;
  return `${prefix}\n${lines.join('\n')}\n\n${content}`;
}

const SLASH_PREFIX = /^\/(plan|edit|chat|ask)\b\s*/i;

/**
 * 若用户以 `/plan`、`/edit`、`/chat`、`/ask` 开头，覆盖本轮 scenario 并剥除前缀（与侧栏模式组合时以前缀为准）。
 */
export async function applySlashScenarioOverride(
  content: string,
  base: 'chat' | 'plan' | 'code-edit',
  locale: Locale = 'zh-CN'
): Promise<{ scenario: 'chat' | 'plan' | 'code-edit'; prompt: string }> {
  const trimmed = content.trimStart();
  const match = trimmed.match(SLASH_PREFIX);
  if (!match) {
    return { scenario: base, prompt: content };
  }
  const cmd = match[1]!.toLowerCase();
  let scenario: 'chat' | 'plan' | 'code-edit' = base;
  if (cmd === 'plan') {
    scenario = 'plan';
  } else if (cmd === 'edit') {
    scenario = 'code-edit';
  } else if (cmd === 'chat' || cmd === 'ask') {
    scenario = 'chat';
  }
  const rest = trimmed.slice(match[0]!.length).trim();
  const t = await loadLocale(locale);
  const fallback = scenario === 'plan' ? t.composerStructuredPlan : content;
  return { scenario, prompt: rest || fallback };
}
