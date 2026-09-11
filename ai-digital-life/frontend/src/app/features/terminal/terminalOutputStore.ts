/**
 * 终端输出持久化存储
 * 通过 DigitalLifeBridge.terminalOutput 接口读写，自动适配 Tauri/浏览器模式
 */
export const terminalOutputStore = {
  async save(sessionId: string, output: string): Promise<void> {
    try {
      await window.digitalLife.terminalOutput.save(sessionId, output);
    } catch (err) {
      console.warn('[ADL-DEBUG] terminalOutputStore.save FAILED:', err);
    }
  },

  async load(sessionId: string): Promise<string | null> {
    try {
      const result = await window.digitalLife.terminalOutput.load(sessionId);
      if (result.ok) {
        return result.data;
      }
      return null;
    } catch (err) {
      console.warn('[ADL-DEBUG] terminalOutputStore.load FAILED:', err);
      return null;
    }
  },

  async delete(sessionId: string): Promise<void> {
    try {
      await window.digitalLife.terminalOutput.delete(sessionId);
    } catch (err) {
      console.warn('[ADL-DEBUG] terminalOutputStore.delete FAILED:', err);
    }
  },
};
