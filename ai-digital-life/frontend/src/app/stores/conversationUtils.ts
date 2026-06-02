import type { AppInfo, ConversationDetail } from "@ai-digital-life/kernel";
import { copy } from "../i18n";
import { getAppCopy as getAppCopyFromI18n } from "../i18n/getAppCopy";
import { loadConversationState } from "./loaders";

export function sessionFallbackTitle(appInfo?: AppInfo): string {
  return appInfo?.config.language === "en-US" ? copy["en-US"].sessionFallback : copy["zh-CN"].sessionFallback;
}

export function workspaceContextModeFromInfo(appInfo?: AppInfo): "workspace" | "global" {
  return appInfo?.currentWorkspace ? "workspace" : "global";
}

export function getAppCopy(appInfo?: AppInfo) {
  return getAppCopyFromI18n(appInfo);
}

export function hasConversationMessages(detail?: ConversationDetail): boolean {
  return (detail?.messages.length ?? 0) > 0;
}

export async function refreshConversationSlice(activeSessionId?: string) {
  const conversationState = await loadConversationState(activeSessionId);
  return {
    sessions: conversationState.sessions,
    activeSessionId: conversationState.activeSessionId,
    detail: conversationState.detail
  };
}
