/**
 * 终端输出持久化存储
 * 通过 DigitalLifeBridge.terminalOutput 接口读写，自动适配 Tauri/浏览器模式
 */
export const terminalOutputStore = {
  /** 保存会话输出；返回是否成功（历史迁移需据此决定能否删除旧记录） */
  async save(sessionId: string, output: string): Promise<boolean> {
    try {
      await window.digitalLife.terminalOutput.save(sessionId, output);
      return true;
    } catch (err) {
      console.warn('terminalOutputStore: save failed:', err);
      return false;
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
      console.warn('terminalOutputStore: load failed:', err);
      return null;
    }
  },

  async delete(sessionId: string): Promise<void> {
    try {
      await window.digitalLife.terminalOutput.delete(sessionId);
    } catch (err) {
      console.warn('terminalOutputStore: delete failed:', err);
    }
  },
};
