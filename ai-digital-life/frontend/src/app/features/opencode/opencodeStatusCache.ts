import type { DshVersionCatalog, DshVersionStatus, DshVersionSourceMode } from '@shared/ipc/dsh';
import type { OpencodeSourceStatus } from '@shared/ipc/opencode';

/**
 * 「OpenCode CLI」组进场缓存（stale-while-revalidate，会话级持久化）。
 *
 * 背景：`OpencodeSettings` 原先把版本状态/目录/来源全放组件本地 state，
 * 挂载即三桥并发 `refresh()` —— 每次从其它组切回来都卸载重挂、重发 IPC
 * 并重画加载态 → 反复闪烁。本模块缓存**最近一次成功渲染的快照**：
 *
 * - 挂载命中缓存即瞬显真实数据，同时后台静默再验证，回来后 setState 更新；
 * - 仅缓存为空（应用启动后首次进组）才画骨架；骨架形状按关组前持久化的
 *   `versionSource.mode`（localStorage `adl:opencode.versionSourceMode`，
 *   缺省 `auto`）决定是否含「检查更新/正式版本/预发布版本」三行：
 *   `system` 不含，其余包含（`auto` 可能解析为宿主，按包含画，解析为系统
 *   后行隐藏，不闪骨架只换行——与 DSH `manageVisible` 语义一致）。
 * - 模块级生命周期 = 页面会话（刷新即清），无跨会话持久化；来源偏好本身
 *   由后端持久化，localStorage 只存骨架形状提示。
 */

export interface OpencodeSnapshot {
  status: DshVersionStatus | null;
  catalog: DshVersionCatalog | null;
  source: OpencodeSourceStatus | null;
}

let snapshotCache: OpencodeSnapshot | null = null;

const MODE_KEY = 'adl:opencode.versionSourceMode';

function readMode(): DshVersionSourceMode {
  try {
    const raw = window.localStorage?.getItem(MODE_KEY);
    if (raw === 'system' || raw === 'host' || raw === 'auto') {
      return raw;
    }
  } catch {
    // 隐私模式 localStorage 抛异常：回退 auto，与其它持久化读法同口径。
  }
  return 'auto';
}

function writeMode(mode: DshVersionSourceMode): void {
  try {
    window.localStorage?.setItem(MODE_KEY, mode);
  } catch {
    // 写失败静默忽略：只影响下次首帧骨架形状，不影响功能。
  }
}

export function getCachedOpencodeSnapshot(): OpencodeSnapshot | null {
  return snapshotCache;
}

export function setCachedOpencodeSnapshot(snapshot: OpencodeSnapshot): void {
  snapshotCache = snapshot;
  const mode = snapshot.source?.versionSource.mode;
  if (mode) {
    writeMode(mode);
  }
}

/** 关组前（或上次会话同页内）的来源偏好：仅供首帧骨架定形。 */
export function getPersistedOpencodeSourceMode(): DshVersionSourceMode {
  return snapshotCache?.source?.versionSource.mode ?? readMode();
}

/** 测试隔离：模块级缓存跨用例泄漏会让「首帧骨架」类断言失真。 */
export function resetOpencodeSettingsCache(): void {
  snapshotCache = null;
  prefetchInFlight = null;
}

let prefetchInFlight: Promise<void> | null = null;

/**
 * 设置面板打开时的冷填充预热（与存储/环境组同法）：仅缓存为空时拉取三腿并写入；
 * 命中后 no-op。失败静默（挂载路径自有再验证），不阻塞面板。
 */
export function prefetchOpencodeSettings(): Promise<void> {
  if (snapshotCache !== null || prefetchInFlight !== null) {
    return prefetchInFlight ?? Promise.resolve();
  }
  const bridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;
  if (!bridge) {
    return Promise.resolve();
  }
  prefetchInFlight = (async () => {
    try {
      const [s, c, src] = await Promise.all([
        bridge.getVersionStatus(),
        bridge.getVersionCatalog(),
        bridge.getSourceStatus(),
      ]);
      if (s.ok || c.ok || src.ok) {
        setCachedOpencodeSnapshot({
          status: s.ok ? s.data : null,
          catalog: c.ok ? c.data : null,
          source: src.ok ? src.data : null,
        });
      }
    } catch {
      // 预热失败静默：挂载再验证兜底。
    } finally {
      prefetchInFlight = null;
    }
  })();
  return prefetchInFlight;
}
