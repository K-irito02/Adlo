/**
 * 编辑器存盘流水线（每文件串行 + 本地写入回声识别）。
 *
 * 背景：工作区 watcher 会把应用自身的写入/新建也作为 files-changed 批次回传；
 * 同时保存请求在途时用户可能继续输入。若直接用「裸保存响应」覆盖 store 基线，
 * 会出现两类问题：
 *   1. 自写回声被误判为外部变更 → 假冲突；
 *   2. 旧保存响应覆盖新草稿 → 编辑器短暂回退。
 *
 * 这里只持有与「保存/磁盘版本」有关的模块级状态，不进入 React store：
 *   - saveChains：同一文件（工作区 id + 归一化路径）的保存串行化，防止旧写覆盖新写；
 *   - localWriteFingerprint：最近一次本地写入的内容摘要，用于识别 watcher 回声；
 *   - saveSeq：在保存请求入队时推进；迟到响应直接丢弃，不更新基线/mtime/脏标。
 */

const PIPELINE_MAP_LIMIT = 1000;

interface SaveChainEntry {
  promise: Promise<unknown>;
}

const saveChains = new Map<string, SaveChainEntry>();
/** 只存内容摘要（长度 + 64bit 风格 hash），避免为回声识别常驻整份文件文本。 */
const localWriteFingerprint = new Map<string, string>();
const saveSeq = new Map<string, number>();
const externalSignalAt = new Map<string, number>();

/** watcher 信号在保存前的有效窗口（批次到达之后计时）。 */
const EXTERNAL_SIGNAL_TTL_MS = 3000;

/** 稳定的内容指纹：只用于相等判定，不承担密码学用途。 */
function contentFingerprint(content: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${content.length}:${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}

function pruneOldest(map: Map<string, unknown>): void {
  if (map.size < PIPELINE_MAP_LIMIT) {
    return;
  }
  const oldest = map.keys().next();
  if (!oldest.done) {
    map.delete(oldest.value);
  }
}

/** 记录一次本地写入摘要（保存请求发出前）。 */
export function noteLocalWriteContent(key: string, content: string): void {
  pruneOldest(localWriteFingerprint);
  localWriteFingerprint.set(key, contentFingerprint(content));
}

function localWriteFingerprintOf(key: string): string | undefined {
  return localWriteFingerprint.get(key);
}

export function clearLocalWriteContent(key: string): void {
  localWriteFingerprint.delete(key);
}

/** 记录 watcher 命中时刻：保存前若信号仍新鲜，必须读盘复核后再落盘。 */
export function noteExternalSignal(key: string, now: number = Date.now()): void {
  pruneOldest(externalSignalAt);
  externalSignalAt.set(key, now);
}

export function hasRecentExternalSignal(key: string, now: number = Date.now()): boolean {
  const at = externalSignalAt.get(key);
  return at !== undefined && now - at <= EXTERNAL_SIGNAL_TTL_MS;
}

export function clearExternalSignal(key: string): void {
  externalSignalAt.delete(key);
}

/** 开新一次保存代际；返回本次保存的序号。 */
export function beginSaveSequence(key: string): number {
  pruneOldest(saveSeq);
  const next = (saveSeq.get(key) ?? 0) + 1;
  saveSeq.set(key, next);
  return next;
}

/** 本次响应是否仍是该文件最新一次保存（旧响应不得覆盖基线）。 */
export function isLatestSaveSequence(key: string, seq: number): boolean {
  return (saveSeq.get(key) ?? 0) === seq;
}

/**
 * 同一文件的保存串行执行：前一次落定后再执行下一次。
 * 任务内部应重新读取暂存缓冲，确保拿到的是最新草稿。
 */
export function enqueueEditorSave<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = saveChains.get(key)?.promise ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const entry: SaveChainEntry = { promise: run };
  saveChains.set(key, entry);
  // 链尾清理；吞掉 finally 产生的 rejection，避免未处理拒绝。
  void run
    .finally(() => {
      if (saveChains.get(key) === entry) {
        saveChains.delete(key);
      }
    })
    .catch(() => undefined);
  return run;
}

/** 磁盘内容判定：自写回声 / 与基线一致 / 真正的外部修改。 */
export type DiskContentVerdict = 'self-echo' | 'unchanged' | 'external';

export function classifyDiskContent(
  key: string,
  diskContent: string,
  baselineContent: string | undefined,
  pendingContent: string | undefined,
): DiskContentVerdict {
  // 磁盘内容与当前草稿相同：可能是自己的在途保存刚落盘，也可能是外部写入
  // 了完全相同的内容；两种情况都不会造成本地数据损失，按回声处理。
  if (pendingContent !== undefined && diskContent === pendingContent) {
    return 'self-echo';
  }
  if (contentFingerprint(diskContent) === localWriteFingerprintOf(key)) {
    return 'self-echo';
  }
  if (baselineContent !== undefined && diskContent === baselineContent) {
    return 'unchanged';
  }
  return 'external';
}

/** 删除文件 / 移除工作区 / 清理缓存时同步清理流水线状态。 */
export function clearEditorSaveState(key: string): void {
  localWriteFingerprint.delete(key);
  // 不删除代际而是推进：清理发生时正在飞行的旧响应必须继续被判定为过期，
  // 否则新请求从 0 重新计数会与旧响应撞号。
  saveSeq.set(key, (saveSeq.get(key) ?? 0) + 1);
  externalSignalAt.delete(key);
}

/** 按 `${workspaceId}:${relativePath}/` 前缀清理文件夹后代。 */
export function clearEditorSaveStateForPrefix(prefix: string): void {
  for (const key of [...localWriteFingerprint.keys()]) {
    if (key.startsWith(prefix)) {
      localWriteFingerprint.delete(key);
    }
  }
  for (const key of [...saveSeq.keys()]) {
    if (key.startsWith(prefix)) {
      saveSeq.set(key, (saveSeq.get(key) ?? 0) + 1);
    }
  }
  for (const key of [...externalSignalAt.keys()]) {
    if (key.startsWith(prefix)) {
      externalSignalAt.delete(key);
    }
  }
}

export function clearEditorSaveStateForWorkspace(workspacePrefix: string): void {
  const boundary = `${workspacePrefix}:`;
  for (const key of [...localWriteFingerprint.keys()]) {
    if (key.startsWith(boundary)) {
      localWriteFingerprint.delete(key);
    }
  }
  for (const key of [...saveSeq.keys()]) {
    if (key.startsWith(boundary)) {
      saveSeq.set(key, (saveSeq.get(key) ?? 0) + 1);
    }
  }
  for (const key of [...externalSignalAt.keys()]) {
    if (key.startsWith(boundary)) {
      externalSignalAt.delete(key);
    }
  }
}
