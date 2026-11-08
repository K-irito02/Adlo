import { describe, expect, it } from 'vitest';
import {
  beginSaveSequence,
  classifyDiskContent,
  clearEditorSaveState,
  clearEditorSaveStateForWorkspace,
  clearExternalSignal,
  enqueueEditorSave,
  hasRecentExternalSignal,
  isLatestSaveSequence,
  noteExternalSignal,
  noteLocalWriteContent,
} from './editorSavePipeline';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('editorSavePipeline', () => {
  it('保存代际：只有最新请求的响应可落地；清理时推进代际', () => {
    const key = 'test:race.txt';
    clearEditorSaveStateForWorkspace('test');
    const first = beginSaveSequence(key);
    expect(isLatestSaveSequence(key, first)).toBe(true);
    const second = beginSaveSequence(key);
    expect(isLatestSaveSequence(key, first)).toBe(false);
    expect(isLatestSaveSequence(key, second)).toBe(true);

    clearEditorSaveState(key);
    expect(isLatestSaveSequence(key, second)).toBe(false);
    const third = beginSaveSequence(key);
    expect(isLatestSaveSequence(key, third)).toBe(true);
    // 清理必须是「推进」而不是「删除归零」：新代际要大于旧代际。
    expect(third).toBeGreaterThan(second);
  });

  it('内容分类：草稿相同/本地写入回声/基线相同/真外部', () => {
    const key = 'test:classify.txt';
    clearEditorSaveStateForWorkspace('test');
    noteLocalWriteContent(key, 'saved\n');

    expect(classifyDiskContent(key, 'draft\n', 'baseline\n', 'draft\n')).toBe('self-echo');
    expect(classifyDiskContent(key, 'saved\n', 'baseline\n', 'draft\n')).toBe('self-echo');
    expect(classifyDiskContent(key, 'baseline\n', 'baseline\n', 'draft\n')).toBe('unchanged');
    expect(classifyDiskContent(key, 'external\n', 'baseline\n', 'draft\n')).toBe('external');
    // 基线未知时不能把任意内容当成 unchanged。
    expect(classifyDiskContent(key, 'external\n', undefined, 'draft\n')).toBe('external');
  });

  it('watcher 信号 TTL：窗口内新鲜、过期失效、清理后失效', () => {
    const key = 'test:signal.txt';
    clearEditorSaveStateForWorkspace('test');
    noteExternalSignal(key, 1_000);
    expect(hasRecentExternalSignal(key, 1_500)).toBe(true);
    expect(hasRecentExternalSignal(key, 10_000)).toBe(false);
    clearExternalSignal(key);
    expect(hasRecentExternalSignal(key, 1_001)).toBe(false);
  });

  it('同一 key 的保存任务严格串行：前一个未落定，后一个不启动', async () => {
    const key = 'test:serial.txt';
    clearEditorSaveStateForWorkspace('test');
    const first = deferred<void>();
    const started: string[] = [];

    const firstRun = enqueueEditorSave(key, async () => {
      started.push('first');
      await first.promise;
      return 1;
    });
    const secondRun = enqueueEditorSave(key, async () => {
      started.push('second');
      return 2;
    });

    // enqueue 通过 Promise 链调度，先让首个任务进入微任务队列。
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(['first']);
    first.resolve();
    await expect(firstRun).resolves.toBe(1);
    await expect(secondRun).resolves.toBe(2);
    expect(started).toEqual(['first', 'second']);
  });
});
