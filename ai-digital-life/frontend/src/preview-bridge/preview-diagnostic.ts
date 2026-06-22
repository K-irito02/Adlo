import { mockDigitalLifeBridge } from '../mock-bridge';

export function createPreviewDiagnosticBridge() {
  return {
    getHealth: mockDigitalLifeBridge.app.getHealth,
    getDiagnostics: mockDigitalLifeBridge.app.getDiagnostics,
    getModelHealth: mockDigitalLifeBridge.app.getModelHealth,
  };
}
