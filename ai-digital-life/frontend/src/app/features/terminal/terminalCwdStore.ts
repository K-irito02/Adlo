import { makePersistedWriter, readJson } from '@stores/storageHelpers';

/**
 * 按**标签 id** 持久化「上次所在目录」（由 shell 通过 OSC 9;9 上报，见 `terminalCwdOsc.ts`）。
 *
 * 为什么按标签而不是按会话：应用重启后旧会话已被 kill、会话 id 会变，
 * 而标签 id 稳定不变，重建会话时正需要用标签 id 取回目录。
 */
export const TERMINAL_CWD_KEY = 'adl-terminal:cwd-by-tab';

const scheduleWrite = makePersistedWriter(TERMINAL_CWD_KEY);

export const terminalCwdStore = {
  loadAll(): Record<string, string> {
    return readJson<Record<string, string>>(TERMINAL_CWD_KEY, {});
  },
  /** 写入整个映射（去抖，合并高频上报） */
  saveAll(map: Record<string, string>): void {
    scheduleWrite(map);
  },
};
