import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createEditorOutlineFollow,
  createOutlineFollow,
  OUTLINE_FOLLOW_DEBOUNCE_MS,
} from './editorOutlineFollow';

function setup() {
  const apply = vi.fn();
  const texts = new Map<string, string>([
    ['ws-1:a.md', '# A\n'],
    ['ws-2:a.md', '# B\n'],
  ]);
  let selection: { path: string | undefined; workspaceId: string | undefined } = {
    path: 'a.md',
    workspaceId: 'ws-1',
  };
  const follow = createOutlineFollow({
    selection: () => selection,
    readText: (path, workspaceId) => texts.get(`${workspaceId ?? ''}:${path}`),
    apply,
  });
  return {
    follow,
    apply,
    setSelection: (path: string | undefined, workspaceId: string | undefined) => {
      selection = { path, workspaceId };
    },
    setText: (workspaceId: string, path: string, text: string) => {
      texts.set(`${workspaceId}:${path}`, text);
    },
  };
}

describe('createOutlineFollow（打字防抖重建大纲）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('只在防抖窗口结束后重建一次，内容取落定时刻的正文', () => {
    const { follow, apply, setText } = setup();
    follow.schedule('a.md', 'ws-1');
    vi.advanceTimersByTime(OUTLINE_FOLLOW_DEBOUNCE_MS - 1);
    expect(apply).not.toHaveBeenCalled();
    setText('ws-1', 'a.md', '# A v2\n');
    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('a.md', '# A v2\n');
  });

  it('连续输入只落定一次（定时器被重置）', () => {
    const { follow, apply } = setup();
    follow.schedule('a.md', 'ws-1');
    vi.advanceTimersByTime(200);
    follow.schedule('a.md', 'ws-1');
    vi.advanceTimersByTime(OUTLINE_FOLLOW_DEBOUNCE_MS - 1);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('同相对路径切到另一个工作区时不写旧文件的大纲', () => {
    const { follow, apply, setSelection } = setup();
    follow.schedule('a.md', 'ws-1');
    setSelection('a.md', 'ws-2');
    vi.advanceTimersByTime(OUTLINE_FOLLOW_DEBOUNCE_MS);
    expect(apply).not.toHaveBeenCalled();
  });

  it('切到别的文件后不写旧文件的大纲', () => {
    const { follow, apply, setSelection } = setup();
    follow.schedule('a.md', 'ws-1');
    setSelection('b.md', 'ws-1');
    vi.advanceTimersByTime(OUTLINE_FOLLOW_DEBOUNCE_MS);
    expect(apply).not.toHaveBeenCalled();
  });

  it('没有可用正文时放弃本次', () => {
    const { follow, apply, setSelection } = setup();
    setSelection('gone.md', 'ws-1');
    follow.schedule('gone.md', 'ws-1');
    vi.advanceTimersByTime(OUTLINE_FOLLOW_DEBOUNCE_MS);
    expect(apply).not.toHaveBeenCalled();
  });

  it('cancel 后不再落定', () => {
    const { follow, apply } = setup();
    follow.schedule('a.md', 'ws-1');
    follow.cancel();
    vi.advanceTimersByTime(OUTLINE_FOLLOW_DEBOUNCE_MS * 2);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('createEditorOutlineFollow（hook 接线）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('草稿优先；无草稿时回退已保存基线并写入 setOutline', () => {
    const labels: string[] = [];
    const state = {
      selectedFilePath: 'a.md',
      selectedFileWorkspaceId: 'ws-1',
      fileContent: '# saved\n',
      setOutline: (outline: { label: string }[]) => {
        labels.push(outline[0]?.label ?? '');
      },
    };
    let draft: string | undefined = '# draft\n';
    const follow = createEditorOutlineFollow({
      getState: () => state,
      readDraft: () => draft,
      toOutline: (_path, text) => [{ id: 'x', label: text.trim(), kind: 'heading', line: 1 }],
    });

    follow.schedule('a.md', 'ws-1');
    vi.advanceTimersByTime(OUTLINE_FOLLOW_DEBOUNCE_MS);
    expect(labels).toEqual(['# draft']);

    draft = undefined;
    follow.schedule('a.md', 'ws-1');
    vi.advanceTimersByTime(OUTLINE_FOLLOW_DEBOUNCE_MS);
    expect(labels).toEqual(['# draft', '# saved']);
  });
});
