import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '../../slicedStore';

describe('fileOpNoticeSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ fileOpNotices: [] });
  });

  it('pushes a notice and returns its id', () => {
    const id = useAppStore.getState().pushFileOpNotice('file', 'hhh');
    expect(id).toMatch(/^file-op-/);
    const notices = useAppStore.getState().fileOpNotices;
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ id, kind: 'file', name: 'hhh' });
    expect(typeof notices[0].timestamp).toBe('number');
  });

  it('dismisses a notice by id', () => {
    const s = useAppStore.getState();
    const id = s.pushFileOpNotice('folder', 'src');
    s.pushFileOpNotice('file', 'a.txt');
    s.dismissFileOpNotice(id);
    expect(useAppStore.getState().fileOpNotices.map((n) => n.name)).toEqual(['a.txt']);
  });

  it('records the suffix hint flag when provided', () => {
    const s = useAppStore.getState();
    s.pushFileOpNotice('file', 'src', true);
    s.pushFileOpNotice('file', 'README.md');
    const notices = useAppStore.getState().fileOpNotices;
    expect(notices[0].suffixHint).toBe(true);
    expect(notices[1].suffixHint).toBeFalsy();
  });

  it('trims to FILE_OP_NOTICE_LIMIT when many notices are pushed', () => {
    const s = useAppStore.getState();
    for (let i = 0; i < 6; i += 1) {
      s.pushFileOpNotice('file', `f${i}`);
    }
    const notices = useAppStore.getState().fileOpNotices;
    // 超出 FILE_OP_NOTICE_LIMIT(4) 时裁剪最旧条目，保留最新 4 条
    expect(notices).toHaveLength(4);
    expect(notices[notices.length - 1].name).toBe('f5');
    expect(notices[0].name).toBe('f2');
  });
});
