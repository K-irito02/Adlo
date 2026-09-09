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
