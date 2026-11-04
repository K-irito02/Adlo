import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { resolveDshAuthUrl, notifyDshFreedPort } from './dshAuthUrl';

function mockOpen(impl: () => unknown) {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    dsh: { open: vi.fn(impl) },
  };
  return (window as unknown as { digitalLife: { dsh: { open: ReturnType<typeof vi.fn> } } })
    .digitalLife.dsh.open;
}

describe('resolveDshAuthUrl (事项 2)', () => {
  beforeEach(() => {
    useAppStore.setState({ toasts: [] });
  });

  afterEach(() => {
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    vi.restoreAllMocks();
  });

  it('非分发表 URL 直接返回 null，不碰后端桥', async () => {
    const open = mockOpen(async () => ({ ok: true, data: { url: 'x', freedPort: false } }));
    await expect(resolveDshAuthUrl('https://example.com')).resolves.toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it('裸 3080 经后端拿到 token 真实入口', async () => {
    const open = mockOpen(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080/?token=abc', freedPort: false },
    }));
    await expect(resolveDshAuthUrl('http://127.0.0.1:3080')).resolves.toEqual({
      url: 'http://127.0.0.1:3080/?token=abc',
      freedPort: false,
    });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('后端失败/空地址/抛异常一律回退 null（调用方裸开）', async () => {
    mockOpen(async () => ({ ok: false, error: { message: 'down' } }));
    await expect(resolveDshAuthUrl('http://127.0.0.1:3080')).resolves.toBeNull();

    mockOpen(async () => ({ ok: true, data: { url: '  ', freedPort: false } }));
    await expect(resolveDshAuthUrl('http://127.0.0.1:3080/')).resolves.toBeNull();

    mockOpen(() => {
      throw new Error('no bridge');
    });
    await expect(resolveDshAuthUrl('http://localhost:3080')).resolves.toBeNull();
  });

  it('freedPort 原样透出，notify 走 toast（非硬编码文案）', async () => {
    mockOpen(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080/?token=abc', freedPort: true },
    }));
    const resolved = await resolveDshAuthUrl('http://127.0.0.1:3080');
    expect(resolved?.freedPort).toBe(true);
    notifyDshFreedPort({ dshPortFreed: 'FREED-MSG' });
    expect(useAppStore.getState().toasts.some((toast) => toast.message === 'FREED-MSG')).toBe(true);
  });
});
