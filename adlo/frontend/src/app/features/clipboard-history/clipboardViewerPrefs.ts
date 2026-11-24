import { persist } from '@stores/persisted/persist';

/**
 * 「放大查看」弹窗的显示偏好（自动换行 / 预览）。
 *
 * 这两个开关是弹窗级 UI 状态，不宜上提 store；沿用 `persisted/registry` 的
 * 乙类条目（`apply`）：构造期水合把校验后的值写回本模块缓存，组件首帧读取缓存，
 * 显式切换走 `persist()`（关窗 flush 兜底），避免直接 `localStorage.setItem`。
 */
const DEFAULT_WRAP = true;
const DEFAULT_PREVIEW = false;

let wrapCache: boolean | undefined;
let previewCache: boolean | undefined;

/** 登记表 `adl:ui.clipboardViewerWrap` 的 apply。 */
export function applyClipboardViewerWrap(value: boolean): void {
  wrapCache = value;
}

/** 登记表 `adl:ui.clipboardViewerPreview` 的 apply。 */
export function applyClipboardViewerPreview(value: boolean): void {
  previewCache = value;
}

/** 首帧初始值：优先水合缓存，未水合时用默认值。 */
export function readClipboardViewerWrap(): boolean {
  return wrapCache ?? DEFAULT_WRAP;
}

export function readClipboardViewerPreview(): boolean {
  return previewCache ?? DEFAULT_PREVIEW;
}

/** 用户切换后立即生效并落盘（缓存同步更新，避免同帧重挂载读回旧值）。 */
export function setClipboardViewerWrap(value: boolean): void {
  wrapCache = value;
  persist('adl:ui.clipboardViewerWrap', value);
}

export function setClipboardViewerPreview(value: boolean): void {
  previewCache = value;
  persist('adl:ui.clipboardViewerPreview', value);
}

/** 测试专用：清除模块级缓存，模拟全新启动。 */
export function resetClipboardViewerPrefsForTest(): void {
  wrapCache = undefined;
  previewCache = undefined;
}
