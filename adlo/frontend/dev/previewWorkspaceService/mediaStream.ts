/**
 * 浏览器模式的媒体流式端点（与桌面 `adl-server` 的 `GET /workspace/media` 同构）。
 *
 * 为什么需要它（事项 7）：`<img>/<audio>/<video>` 需要可寻址的 URL；过去整文件 base64
 * 走 IPC 再 `URL.createObjectURL`，体积 ×1.33、整文件进内存，于是必须有 50 MiB 上限，
 * 大视频永久打不开。这里按 HTTP Range 只读请求区间：双端同一 URL 形态、同一行为，
 * 大文件秒开且可拖动进度。
 *
 * 与桌面端对齐的边界：空文件/带 Range 的空文件 → 200 空响应；目录 → 400；
 * 缺失文件 → 404；畸形 Range → 忽略（200 整文件）；不可满足 → 416。
 *
 * 单测覆盖 `parseSingleRange` 与 `handleMediaStream` 的路由级 I/O 分支（HEAD/206/416/403/404）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

/**
 * 单段 Range 解析结果（与桌面**端点**行为对齐）：
 * `undefined` = 无 Range / 语法无效（按 RFC 忽略，返回整文件）/ 空文件（桌面在解析前
 * 直接返回 200）；`null` = 不可满足（416）；对象 = 可满足的闭区间。
 * 非空文件时的 `+N`、u64 上限与越界语义与 Rust `parse_single_range` 一致
 * （空文件例外：Rust 解析器会给 416，但桌面路由层提前返回 200）。
 */
const U64_MAX = BigInt('18446744073709551615');
export function parseSingleRange(
  raw: string | undefined,
  total: number,
): { start: number; end: number } | null | undefined {
  if (!raw) {
    return undefined;
  }
  const spec = raw.trim();
  if (!spec.startsWith('bytes=')) {
    return undefined;
  }
  // 媒体播放器只发单段；多段请求按首段处理（RFC 允许服务端降级）。
  const first = spec.slice('bytes='.length).split(',')[0]?.trim() ?? '';
  const dash = first.indexOf('-');
  if (dash < 0) {
    return undefined;
  }
  const startRaw = first.slice(0, dash).trim();
  const endRaw = first.slice(dash + 1).trim();
  // 空文件：合法但无字节——即使带 Range 也返回 200（与桌面端提前返回一致）。
  if (total <= 0) {
    return undefined;
  }

  /** 与 Rust `u64` 解析对齐：允许 `+` 前缀，超过 u64::MAX 视为无效。 */
  const parseIndex = (raw: string): bigint | undefined => {
    if (!/^\+?\d+$/u.test(raw)) {
      return undefined;
    }
    const value = BigInt(raw);
    return value > U64_MAX ? undefined : value;
  };
  const totalBig = BigInt(total);

  if (startRaw === '') {
    // 后缀区间 `bytes=-N`：最后 N 字节；`-` 后不是整数按无效 Range 忽略。
    if (endRaw === '') {
      return undefined;
    }
    const suffix = parseIndex(endRaw);
    if (suffix === undefined) {
      return undefined;
    }
    if (suffix === 0n) {
      return null;
    }
    const length = suffix < totalBig ? suffix : totalBig;
    return { start: total - Number(length), end: total - 1 };
  }
  const start = parseIndex(startRaw);
  if (start === undefined) {
    return undefined;
  }
  if (start >= totalBig) {
    return null;
  }
  let end: bigint;
  if (endRaw === '') {
    end = totalBig - 1n;
  } else {
    const parsed = parseIndex(endRaw);
    if (parsed === undefined) {
      return undefined;
    }
    end = parsed < totalBig ? parsed : totalBig - 1n;
  }
  if (end < start) {
    return null;
  }
  return { start: Number(start), end: Number(end) };
}

export interface MediaStreamRouteDeps {
  /** 工作区相对路径 → 绝对路径（越界抛错）；与 `files.resolveWorkspacePath` 同一实现。 */
  resolveAbsolute: (workspacePath: string, relativePath: string) => string;
  /** 扩展名 → MIME（与 Rust `guess_media_mime` 对齐）。 */
  guessMime: (relativePath: string) => string;
}

/**
 * 处理 `GET <prefix>/workspace/media?path=…&workspacePath=…`（HTTP 响应由本函数写出）。
 */
export async function handleMediaStream(
  request: IncomingMessage,
  response: ServerResponse,
  searchParams: URLSearchParams,
  deps: MediaStreamRouteDeps,
): Promise<void> {
  const workspacePath = (searchParams.get('workspacePath') ?? '').trim();
  const relativePath = (searchParams.get('path') ?? '').trim();
  if (!workspacePath || !relativePath) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('workspacePath and path are required');
    return;
  }

  let absolute: string;
  try {
    absolute = deps.resolveAbsolute(workspacePath, relativePath);
  } catch (error) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : String(error));
    return;
  }

  const info = await stat(absolute).catch(() => null);
  if (!info) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('media file not found');
    return;
  }
  if (!info.isFile()) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('media target is not a file');
    return;
  }

  const total = info.size;
  const mime = deps.guessMime(relativePath);
  const parsed = parseSingleRange(request.headers.range, total);
  if (parsed === null) {
    response.writeHead(416, {
      'content-range': `bytes */${total}`,
      'accept-ranges': 'bytes',
    });
    response.end();
    return;
  }

  const start = parsed?.start ?? 0;
  const end = parsed?.end ?? Math.max(total - 1, 0);
  const length = total === 0 ? 0 : end - start + 1;
  const headers: Record<string, string | number> = {
    'content-type': mime,
    'content-length': length,
    'accept-ranges': 'bytes',
    // 与桌面端同名的 mtime 毫秒头：前端 `mediaSource` 用它做外部变更比对。
    'x-adl-mtime-ms': String(Math.floor(info.mtimeMs)),
    // 面板里看到的始终是磁盘现状：禁用缓存，编辑后刷新即生效。
    'cache-control': 'no-store',
  };
  if (parsed) {
    headers['content-range'] = `bytes ${start}-${end}/${total}`;
  }
  response.writeHead(parsed ? 206 : 200, headers);
  // HEAD 探测（`mediaSource` 用它区分「文件不存在」与「解码失败」）：只回头，不读盘。
  if (request.method === 'HEAD' || length === 0) {
    response.end();
    return;
  }
  const stream = createReadStream(absolute, { start, end });
  stream.on('error', () => {
    response.destroy();
  });
  stream.pipe(response);
}
