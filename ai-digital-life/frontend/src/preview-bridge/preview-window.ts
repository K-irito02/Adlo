import { mockDigitalLifeBridge } from '../mock-bridge';

export function createPreviewWindowBridge() {
  return {
    window: mockDigitalLifeBridge.window,
  };
}
