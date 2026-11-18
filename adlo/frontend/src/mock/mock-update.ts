import { IpcErrorCode } from '../shared/ipc/shared';
import type { IpcResult } from '@adlo/kernel';
import type { UpdateBridge } from '../shared/ipc/update';

const NOT_DESKTOP = 'app update is only available in the desktop app';

const unsupported = <T>(): Promise<IpcResult<T>> =>
  Promise.resolve({
    ok: false,
    error: { code: IpcErrorCode.INVOKE_ERROR, message: NOT_DESKTOP },
  });

/**
 * 浏览器模式的更新桥接：没有可替换的安装体，因此什么都做不了。
 * `supported: false` 让 UI 直接渲染「随宿主构建更新」的说明，而不是报错。
 */
export function createMockUpdateBridge(): UpdateBridge {
  return {
    supported: false,
    check: () => unsupported(),
    download: () => unsupported(),
    install: () => unsupported(),
    onProgress: () => () => undefined,
    onInstalling: () => () => undefined,
  };
}
