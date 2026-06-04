const CONVERSATION_PANEL_HEIGHT_KEY = 'adl-ui:conversation-panel-height';
const DEFAULT_CONVERSATION_PANEL_HEIGHT = 180;
const MIN_CONVERSATION_PANEL_HEIGHT = 120;
const MAX_CONVERSATION_PANEL_HEIGHT = 9_999;

export function readConversationPanelHeight(): number {
  try {
    const raw = Number(window.localStorage.getItem(CONVERSATION_PANEL_HEIGHT_KEY));
    if (Number.isFinite(raw)) {
      return Math.max(MIN_CONVERSATION_PANEL_HEIGHT, Math.min(MAX_CONVERSATION_PANEL_HEIGHT, raw));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONVERSATION_PANEL_HEIGHT;
}

export function writeConversationPanelHeight(value: number): void {
  try {
    window.localStorage.setItem(CONVERSATION_PANEL_HEIGHT_KEY, String(value));
  } catch {
    /* ignore */
  }
}

export function clampConversationPanelHeight(value: number, maxHeight: number): number {
  return Math.max(MIN_CONVERSATION_PANEL_HEIGHT, Math.min(maxHeight, value));
}
