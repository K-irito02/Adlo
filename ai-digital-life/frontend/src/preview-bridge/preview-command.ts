import { mockDigitalLifeBridge } from '../mock-bridge';
import type { CommandBridge } from '../shared/ipc';

export function createPreviewCommandBridge(): CommandBridge {
  return mockDigitalLifeBridge.command;
}
