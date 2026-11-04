import type { DigitalLifeBridge } from '../shared/ipc/digital-life';

type MockBridge = Pick<DigitalLifeBridge['app'], 'getHealth' | 'getDiagnostics'>;

export function createPreviewDiagnosticBridge(mockApp: MockBridge) {
  return {
    getHealth: mockApp.getHealth,
    getDiagnostics: mockApp.getDiagnostics,
  };
}
