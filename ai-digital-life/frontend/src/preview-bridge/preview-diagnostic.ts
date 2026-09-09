export async function createPreviewDiagnosticBridge() {
  const { mockDigitalLifeBridge } = await import('../mock-bridge');
  return {
    getHealth: mockDigitalLifeBridge.app.getHealth,
    getDiagnostics: mockDigitalLifeBridge.app.getDiagnostics,
    getModelHealth: mockDigitalLifeBridge.app.getModelHealth,
  };
}
