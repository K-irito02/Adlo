import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { IpcErrorCode } from '../shared/ipc/shared';
import type { IpcResult } from '@adlo/kernel';

export async function invokeIpc<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<IpcResult<T>> {
  try {
    return await invoke<IpcResult<T>>(cmd, args);
  } catch (e) {
    // TypeError 通常表示网络/超时错误
    if (e instanceof TypeError) {
      const message = e.message;
      return { ok: false, error: { code: IpcErrorCode.NETWORK_ERROR, message } };
    }
    // Tauri 后端返回的结构化错误 — 透传 error code
    if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
      const { code, message } = e as { code: string; message: string };
      return { ok: false, error: { code: code as IpcErrorCode, message } };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: IpcErrorCode.INVOKE_ERROR, message } };
  }
}

/**
 * 把 `IpcResult` 的失败转成异常。
 *
 * `Promise<void>` 形态的桥接方法没有错误通道，若直接 `.then(() => undefined)`
 * 就把业务错误（权限、标签页 WebView 尚未创建等）吞成“点了没反应”。需要让调用
 * 方感知失败的入口经此解包：成功返回 data，失败 throw 带 `code` 的 Error，供
 * 上层按错误码给出具体提示。
 */
export function requireIpcOk<T>(result: IpcResult<T>): T | undefined {
  if (!result.ok) {
    throw Object.assign(new Error(result.error.message), { code: result.error.code });
  }
  return result.data;
}

export function subscribeChannel<T>(eventName: string, listener: (payload: T) => void): () => void {
  let active = true;
  let ul: UnlistenFn | undefined;
  void listen<T>(eventName, (event) => {
    if (active) {
      listener(event.payload);
    }
  }).then((unlisten) => {
    if (active) {
      ul = unlisten;
    } else {
      /* unlisten() is typed () => void but actually async; catch rejection via wrapper */
      void Promise.resolve(unlisten()).catch(() => {});
    }
  });
  return () => {
    active = false;
    void Promise.resolve(ul?.()).catch(() => {});
  };
}

export function isTauriShell(): boolean {
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    const candidate = window as typeof window & {
      __TAURI__?: unknown;
      __TAURI_INTERNALS__?: unknown;
    };
    return Boolean(candidate.__TAURI_INTERNALS__ ?? candidate.__TAURI__);
  } catch {
    return false;
  }
}
