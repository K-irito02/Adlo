import { mockDigitalLifeBridge } from '../mock-bridge';

export function createPreviewWindowBridge() {
  return {
    window: mockDigitalLifeBridge.window,
    browser: {
      navigate: async (_url: string) => {},
      goBack: async () => true,
      goForward: async () => true,
      reload: async () => {},
    },
  };
}
