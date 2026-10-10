export const PREVIEW_API_PREFIX = '/__adl_preview_api__';

import type { IpcResult } from '@ai-digital-life/kernel';
import { IpcErrorCode } from './shared';

export async function requestPreviewApi<T>(
  pathname: string,
  init?: RequestInit,
): Promise<IpcResult<T>> {
  try {
    const response = await fetch(`${PREVIEW_API_PREFIX}${pathname}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    // 非 2xx 直接抛错走 PREVIEW_API_ERROR：dev 服务恒返 200 + IpcResult 信封，
    // 错误页 HTML 若走到 response.json() 会抛错但归因粗糙（看不出 HTTP 状态）。
    if (!response.ok) {
      throw new Error(`preview API failed: HTTP ${response.status}`);
    }
    return (await response.json()) as IpcResult<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        code: IpcErrorCode.PREVIEW_API_ERROR,
        message,
      },
    };
  }
}
