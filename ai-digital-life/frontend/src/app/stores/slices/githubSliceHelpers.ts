/**
 * GitHub 切片辅助函数
 * 从 githubSlice.ts 提取的类型、Bridge 检测和令牌存在标记逻辑。
 * 配置 / 分区 / 开关的水合由 persisted/hydrateAll 拥有（Task 29），此处仅保留
 * Tauri 钥匙串的异步存在标记（只写不回读）。
 */
import type { DigitalLifeBridge } from '@shared/ipc/digital-life';

export type GitHubSection = 'overview' | 'workflows' | 'jobs' | 'logs' | 'settings' | 'help';

export function getBridge(): DigitalLifeBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as unknown as { digitalLife: DigitalLifeBridge | undefined }).digitalLife ?? null;
}

export function isTauriMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

/**
 * Tauri 模式的令牌存在标记：bridge 钥匙串有 token 时返回 '::stored::' 占位，
 * 否则返回 undefined（调用方此时不得覆盖水合值）。配置 / 分区 / 开关不再经由
 * 此处读盘——它们由 hydrateAll 同步水合；浏览器模式的令牌镜像同样由水合拥有。
 */
export async function hydrateCiTokenMarker(): Promise<string | undefined> {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const bridge = getBridge();
  if (
    isTauriMode() &&
    bridge &&
    bridge.github &&
    typeof bridge.github.hasAccessToken === 'function'
  ) {
    try {
      const hasResult = await bridge.github.hasAccessToken();
      if (hasResult && hasResult.ok && hasResult.data) {
        return '::stored::';
      }
    } catch (err) {
      console.warn('githubSliceHelpers: localStorage/bridge operation failed:', err);
    }
  }
  return undefined;
}
