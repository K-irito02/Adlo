import { mockDigitalLifeBridge } from '../mock-bridge';
import type { ConversationBridge } from '../shared/ipc';

export function createPreviewConversationBridge(): ConversationBridge {
  return mockDigitalLifeBridge.conversation;
}
