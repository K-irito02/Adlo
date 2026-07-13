import type { AppInfo, ConversationDetail } from '@ai-digital-life/kernel';
import { loadLocale } from '../i18n/i18nLoader';
import { loadConversationState } from './loaders';

export { getAppCopy } from '../i18n/getAppCopy';

export async function sessionFallbackTitle(appInfo?: AppInfo): Promise<string> {
  const lang = appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
  const dict = await loadLocale(lang);
  return dict.sessionFallback;
}

export function workspaceContextModeFromInfo(appInfo?: AppInfo): 'workspace' | 'global' {
  return appInfo?.currentWorkspace ? 'workspace' : 'global';
}

export function hasConversationMessages(detail?: ConversationDetail): boolean {
  return (detail?.messages.length ?? 0) > 0;
}

export async function refreshConversationSlice(activeSessionId?: string) {
  const conversationState = await loadConversationState(activeSessionId);
  return {
    sessions: conversationState.sessions,
    activeSessionId: conversationState.activeSessionId,
    detail: conversationState.detail,
  };
}
