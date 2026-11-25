import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { resolveDshAuthUrl } from './dshAuthUrl';

function mockOpen(impl: (force?: boolean) => unknown) {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    dsh: { open: vi.fn(impl) },
  };
  return (window as unknown as { digitalLife: { dsh: { open: ReturnType<typeof vi.fn> } } })
    .digitalLife.dsh.open;
}

describe('resolveDshAuthUrl (事项 2)', () => {
  beforeEach(() => {
    useAppStore.setState({ toasts: [], dshPortConflict: null });
  });

  afterEach(() => {
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    vi.restoreAllMocks();
  });

  it('非分发表 URL 直接返回 null，不碰后端桥', async () => {
    const open = mockOpen(async () => ({ ok: true, data: { url: 'x' } }));
    await expect(resolveDshAuthUrl('https://example.com')).resolves.toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it('裸 3080 经后端拿到 token 真实入口', async () => {
    const open = mockOpen(async () => ({
      ok: true,
      data: { status: 'opened', url: 'http://127.0.0.1:3080/?token=abc' },
    }));
    await expect(resolveDshAuthUrl('http://127.0.0.1:3080')).resolves.toEqual({
      url: 'http://127.0.0.1:3080/?token=abc',
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(false);
  });

  it('后端失败/空地址/抛异常一律回退 null（调用方裸开）', async () => {
    mockOpen(async () => ({ ok: false, error: { message: 'down' } }));
    await expect(resolveDshAuthUrl('http://127.0.0.1:3080')).resolves.toBeNull();

    mockOpen(async () => ({ ok: true, data: { status: 'opened', url: '  ' } }));
    await expect(resolveDshAuthUrl('http://127.0.0.1:3080/')).resolves.toBeNull();

    mockOpen(() => {
      throw new Error('no bridge');
    });
    await expect(resolveDshAuthUrl('http://localhost:3080')).resolves.toBeNull();
  });

  it('端口占用时弹确认框；取消返回 {canceled:true}，确认后以 force=true 重试', async () => {
    const occupant = {
      port: 3080,
      processes: [{ pid: 42, name: 'node.exe', cmdline: 'node dsh', isDsh: true }],
    };
    let call = 0;
    const open = mockOpen(async (force?: boolean) => {
      call += 1;
      if (call === 1) {
        return {
          ok: true,
          data: { status: 'port_occupied', url: null, occupant },
        };
      }
      return {
        ok: true,
        data: {
          status: force ? 'opened' : 'port_occupied',
          url: force ? 'http://127.0.0.1:3080/?token=new' : null,
          occupant,
        },
      };
    });

    // 取消：确认框出现，用户拒绝后返回 null，不触发 force 调用。
    const cancelPromise = resolveDshAuthUrl('http://127.0.0.1:3080');
    await vi.waitFor(() => expect(useAppStore.getState().dshPortConflict).toEqual(occupant));
    useAppStore.getState().resolveDshPortConflict(false);
    await expect(cancelPromise).resolves.toEqual({ canceled: true });
    expect(open).toHaveBeenCalledTimes(1);

    // 确认：第二次调用带 force=true，返回真实入口。
    const acceptPromise = resolveDshAuthUrl('http://127.0.0.1:3080');
    await vi.waitFor(() => expect(useAppStore.getState().dshPortConflict).toEqual(occupant));
    useAppStore.getState().resolveDshPortConflict(true);
    await expect(acceptPromise).resolves.toEqual({
      url: 'http://127.0.0.1:3080/?token=new',
    });
    expect(open).toHaveBeenCalledTimes(3);
    expect(open).toHaveBeenLastCalledWith(true);
  });
});
