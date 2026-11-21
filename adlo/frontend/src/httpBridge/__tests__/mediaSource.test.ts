import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeMediaSource } from '../../httpBridge';

/**
 * `probeMediaSource` 是「媒体来源」的唯一入口（事项 7）：
 * HEAD 只取元信息，不传字节；404 → NOT_FOUND（错误视图），其余状态 → IO_ERROR。
 * URL 带 mtime 版本号，外部变更换 URL 才会让 `<video>` 重新取帧。
 */
describe('probeMediaSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: { status: number; headers?: Record<string, string> }) {
    const fetchMock = vi.fn(async () => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers ?? {})) {
        headers.set(key, value);
      }
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        headers,
      };
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('returns a versioned Range URL with metadata on 200', async () => {
    const fetchMock = stubFetch({
      status: 200,
      headers: {
        'content-type': 'video/mp4',
        'content-length': '62914560',
        'x-adl-mtime-ms': '1795178950299',
      },
    });

    const result = await probeMediaSource(
      'http://127.0.0.1:42/workspace/media',
      'C:\\ws\\demo',
      'music/big.mp4',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 只探测，不拉字节；且必须显式 HEAD。
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toEqual({
      method: 'HEAD',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.mime).toBe('video/mp4');
    expect(result.data.size).toBe(62914560);
    expect(result.data.lastModifiedAt).toBe(1795178950299);
    expect(result.data.path).toBe('music/big.mp4');
    const url = new URL(result.data.url);
    expect(url.pathname).toBe('/workspace/media');
    expect(url.searchParams.get('workspacePath')).toBe('C:\\ws\\demo');
    expect(url.searchParams.get('path')).toBe('music/big.mp4');
    expect(url.searchParams.get('v')).toBe('1795178950299');
  });

  it('maps 404 to NOT_FOUND so the caller can show the missing-file view', async () => {
    stubFetch({ status: 404 });
    const result = await probeMediaSource(
      'http://127.0.0.1:42/workspace/media',
      'C:\\ws\\demo',
      'gone.mp4',
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toContain('gone.mp4');
  });

  it('maps other failures to IO_ERROR and network errors to NETWORK_ERROR', async () => {
    stubFetch({ status: 500 });
    const ioFailure = await probeMediaSource(
      'http://127.0.0.1:42/workspace/media',
      'C:\\ws\\demo',
      'broken.mp4',
    );
    expect(ioFailure.ok).toBe(false);
    if (!ioFailure.ok) {
      expect(ioFailure.error.code).toBe('IO_ERROR');
    }

    const throwing = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', throwing);
    const networkFailure = await probeMediaSource(
      'http://127.0.0.1:42/workspace/media',
      'C:\\ws\\demo',
      'broken.mp4',
    );
    expect(networkFailure.ok).toBe(false);
    if (!networkFailure.ok) {
      expect(networkFailure.error.code).toBe('NETWORK_ERROR');
    }
  });
});
