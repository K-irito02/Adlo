import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleMediaStream, parseSingleRange, type MediaStreamRouteDeps } from './mediaStream';

describe('parseSingleRange（浏览器模式媒体端点）', () => {
  it('returns undefined when no Range header is present', () => {
    expect(parseSingleRange(undefined, 100)).toBeUndefined();
    expect(parseSingleRange('', 100)).toBeUndefined();
    expect(parseSingleRange('items=0-1', 100)).toBeUndefined();
  });

  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseSingleRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseSingleRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseSingleRange('bytes=-5', 100)).toEqual({ start: 95, end: 99 });
    // 尾端越界按文件末尾裁剪（RFC 7233 §2.1）。
    expect(parseSingleRange('bytes=95-500', 100)).toEqual({ start: 95, end: 99 });
    // 多段请求按首段降级（播放器只发单段）。
    expect(parseSingleRange('bytes=0-9,20-29', 100)).toEqual({ start: 0, end: 9 });
  });

  it('returns null for unsatisfiable ranges (416)', () => {
    expect(parseSingleRange('bytes=100-120', 100)).toBeNull();
    expect(parseSingleRange('bytes=20-10', 100)).toBeNull();
    expect(parseSingleRange('bytes=-0', 100)).toBeNull();
  });

  it('ignores malformed ranges like the desktop endpoint (200 full file)', () => {
    expect(parseSingleRange('bytes=abc-def', 100)).toBeUndefined();
    expect(parseSingleRange('bytes=0-abc', 100)).toBeUndefined();
    expect(parseSingleRange('bytes=-abc', 100)).toBeUndefined();
    expect(parseSingleRange('bytes=-', 100)).toBeUndefined();
    // 空文件与桌面一致：提前返回 200 空响应，不按 416 处理。
    expect(parseSingleRange('bytes=0-9', 0)).toBeUndefined();
    // 超出安全整数但仍在 u64 内：按桌面 u64 解析语义（可满足则 206，越界则 416）。
    expect(parseSingleRange('bytes=9007199254740993-', 100)).toBeNull();
    // 与 Rust `u64` 解析一致：允许 `+` 前缀。
    expect(parseSingleRange('bytes=+5-6', 100)).toEqual({ start: 5, end: 6 });
    // 超过 u64::MAX：Rust 解析失败 → 忽略（200 整文件）。
    expect(parseSingleRange('bytes=18446744073709551616-', 100)).toBeUndefined();
    // == u64::MAX：可解析但 start >= total → 416。
    expect(parseSingleRange('bytes=18446744073709551615-', 100)).toBeNull();
  });
});

class FakeResponse extends PassThrough {
  status = 0;
  headers: Record<string, string | number> = {};

  writeHead(status: number, headers?: Record<string, string | number>) {
    this.status = status;
    this.headers = headers ?? {};
    return this;
  }
}

const DEPS: MediaStreamRouteDeps = {
  resolveAbsolute: (workspacePath, relativePath) => {
    if (workspacePath === 'escape') {
      throw new Error('path escapes workspace boundary');
    }
    return path.join(workspacePath, relativePath);
  },
  guessMime: () => 'video/mp4',
};

interface RouteResult {
  status: number;
  headers: Record<string, string | number>;
  body: Buffer;
}

async function runRoute(options: {
  method: 'GET' | 'HEAD';
  root: string;
  relativePath?: string;
  range?: string;
}): Promise<RouteResult> {
  const response = new FakeResponse();
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve) => response.on('end', () => resolve()));
  const params = new URLSearchParams({
    workspacePath: options.root,
    path: options.relativePath ?? 'clip.mp4',
  });
  const request = {
    method: options.method,
    headers: options.range ? { range: options.range } : {},
  } as unknown as IncomingMessage;

  await handleMediaStream(request, response as unknown as ServerResponse, params, DEPS);
  await ended;
  return { status: response.status, headers: response.headers, body: Buffer.concat(chunks) };
}

describe('handleMediaStream（路由级 I/O 分支）', () => {
  let root = '';
  const bytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'adl-media-stream-'));
    await writeFile(path.join(root, 'clip.mp4'), bytes);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('HEAD returns headers without a body', async () => {
    const result = await runRoute({ method: 'HEAD', root });

    expect(result.status).toBe(200);
    expect(result.headers['content-length']).toBe(bytes.length);
    expect(result.headers['accept-ranges']).toBe('bytes');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-adl-mtime-ms']).toMatch(/^\d+$/u);
    expect(result.body.length).toBe(0);
  });

  it('Range returns 206 with content-range and only the requested bytes', async () => {
    const result = await runRoute({ method: 'GET', root, range: 'bytes=2-5' });

    expect(result.status).toBe(206);
    expect(result.headers['content-range']).toBe(`bytes 2-5/${bytes.length}`);
    expect(result.body).toEqual(bytes.subarray(2, 6));
  });

  it('malformed Range is ignored (200 full file), matching the desktop endpoint', async () => {
    const result = await runRoute({ method: 'GET', root, range: 'bytes=abc' });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(bytes);
  });

  it('unsatisfiable Range returns 416', async () => {
    const result = await runRoute({ method: 'GET', root, range: 'bytes=99-120' });

    expect(result.status).toBe(416);
    expect(result.headers['content-range']).toBe(`bytes */${bytes.length}`);
  });

  it('missing file returns 404', async () => {
    const result = await runRoute({ method: 'GET', root, relativePath: 'gone.mp4' });
    expect(result.status).toBe(404);
  });

  it('directory target returns 400 like the desktop endpoint', async () => {
    const result = await runRoute({ method: 'GET', root, relativePath: '.' });
    expect(result.status).toBe(400);
  });

  it('empty file with Range returns 200 with zero bytes', async () => {
    await writeFile(path.join(root, 'empty.mp4'), Buffer.alloc(0));
    const result = await runRoute({
      method: 'GET',
      root,
      relativePath: 'empty.mp4',
      range: 'bytes=0-9',
    });

    expect(result.status).toBe(200);
    expect(result.headers['content-length']).toBe(0);
    expect(result.body.length).toBe(0);
  });

  it('path escape returns 403', async () => {
    const result = await runRoute({ method: 'GET', root: 'escape' });
    expect(result.status).toBe(403);
  });
});
