/**
 * 终端输出持久化存储
 * 通过 DigitalLifeBridge.terminalOutput 接口读写，自动适配 Tauri/浏览器模式
 */
export const terminalOutputStore = {
  /** 保存会话输出；返回是否成功（采集器据它决定是否推进水位） */
  async save(sessionId: string, output: string): Promise<boolean> {
    try {
      // 必须检查 result.ok：业务错误（如体积超限）不会抛异常，
      // 只看 catch 会把「服务端拒绝」误判成「保存成功」，历史静默截断。
      const result = await window.digitalLife.terminalOutput.save(sessionId, output);
      if (!result.ok) {
        console.warn('terminalOutputStore: save rejected:', result.error);
        return false;
      }
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
