# 分支图谱头像缓存与闪烁修复

**日期**：2026-07-30
**模块**：git-visualization（分支图谱）
**文件**：`avatarCache.ts`、`commitTooltipUtils.ts`、`BranchGraph.tsx`

## 问题背景

分支图谱表格中作者头像存在三类问题：
1. 鼠标悬停表格行时泳道对应链表节点无放大效果
2. 作者列显示"头像缺失图片"而非兜底像素头像
3. Tooltip 卡片中兜底像素头像出现延迟
4. 快速滚动时头像闪烁（本地像素头像 → Gravatar retro 像素头像）
5. 缓存命中后快速滚动仍闪烁

## 解决方案

### 1. 两级缓存架构（L1 内存 + L2 IndexedDB）

- **L1 内存**：`Map<key, TTLCacheEntry>` + LRU（200 条）+ TTL（7 天），存 Blob URL
- **L2 IndexedDB**：持久化存储原始 Blob，跨会话复用
- **SWR 语义**：stale 条目立即返回 + 后台 revalidate，失败保留旧条目
- **in-flight 去重**：相同 email 的并发请求共享同一 Promise

### 2. 同步缓存查找 API（解决快速滚动闪烁）

```typescript
export function getCachedAvatarUrl(email: string): string | null
```

在 `useState` 初始化器中调用，同步检查 L1 缓存（fresh OR stale），命中则直接使用缓存 URL，避免 pixel avatar 阶段闪烁。

### 3. 延迟 Blob URL 撤销模式（解决 SWR revalidate 破图）

**核心问题**：SWR revalidate 覆写缓存条目时，组件可能仍持有旧 Blob URL。立即撤销会破图；不撤销则内存泄漏。

**解决方案**：
```typescript
const REVOKE_DELAY_MS = 30000; // 30 秒延迟
const pendingRevokes = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRevoke(blobUrl: string): void {
  if (pendingRevokes.has(blobUrl)) return;
  const timer = setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    pendingRevokes.delete(blobUrl);
  }, REVOKE_DELAY_MS);
  pendingRevokes.set(blobUrl, timer);
}
```

- 覆写和 LRU 淘汰统一使用 `scheduleRevoke`（30 秒延迟）
- `clearAvatarCache` 立即撤销所有 URL（含 pending）
- 统一了策略矛盾（之前覆写不撤销，淘汰立即撤销）

### 4. Generation Token 模式（解决 clearAvatarCache 竞态）

**核心问题**：`clearAvatarCache` 清空数据结构后，飞行中的 revalidate/network fetch 完成后会重新写入缓存。

**解决方案**：
```typescript
let cacheGeneration = 0;

function scheduleRevalidate(key: string, size: number): void {
  const gen = cacheGeneration;
  setTimeout(async () => {
    const result = await fetchAvatarFromNetwork(key, size);
    if (gen !== cacheGeneration) return; // 缓存已被清除
    if (result) await setAvatar(key, result.blob, result.source);
  }, 0);
}

export async function clearAvatarCache(): Promise<void> {
  cacheGeneration++; // 使所有飞行中操作失效
  // ... 清理逻辑
}
```

### 5. SWR 契约履行

缓存命中（含 stale）时仍调用 `getAvatar` 触发后台 revalidate：
```tsx
const cached = getCachedAvatarUrl(email);
if (cached) {
  setSrc(cached);
  getAvatar(email, size).then((freshUrl) => {
    if (!cancelled && freshUrl && freshUrl !== cached) {
      setSrc(freshUrl);
    }
  });
}
```

### 6. 本地像素头像优化

- 5x5 对称网格 identicon（MD5 hash 派生）
- HSL 色彩（hue/sat/light 从 hash 不同位置提取）
- 圆角单元格 + 半透明背景 tinted by hue
- 适配深色主题（低透明度 HSLA 填充）
- UTF-8 编码（`TextEncoder`）确保与 Gravatar 服务端 MD5 一致

## 经验教训

1. **Blob URL 生命周期管理**：`createObjectURL` 创建的 URL 必须显式 `revokeObjectURL`，否则 Blob 对象常驻内存。但在组件可能仍持有时不能立即撤销 — 延迟撤销是平衡方案。

2. **SWR 与组件同步**：SWR 的 stale-while-revalidate 语义要求调用方在拿到 stale 值后仍触发 revalidate。否则 stale 条目永不被刷新。

3. **异步操作与清除竞态**：`clear` 操作必须使飞行中的异步操作失效。Generation token 是轻量级方案，无需取消 Promise。

4. **同步缓存查找避免闪烁**：`useState` 初始化器中同步检查缓存，可完全避免初始值 → 缓存值的状态切换闪烁。

5. **useCallback 稳定引用**：将 useMemo 内部使用的函数用 useCallback 包裹，确保引用稳定，避免 useMemo 因函数引用变化而无效重算。

6. **HMR 安全的全局注册**：模块级全局数组在 HMR 时可能重复注册，使用 name 去重保证幂等。

7. **Windows 文件系统大小写不敏感**：重命名文件大小写需要两步操作（先改为临时名，再改为目标名）。

8. **LRU 驱逐与持久化存储的分离**：L1 内存缓存的 LRU 驱逐只移除内存条目（并延迟撤销 Blob URL），不应删除 L2 IndexedDB 记录。设计意图是"过期条目在被新数据成功替换前永不删除" — 这样即使 L1 因容量压力驱逐了某条目，下次访问时仍可从 L2 快速恢复，无需网络请求。L2 记录只在新数据覆写（`setAvatar`）或显式 `clearAvatarCache` 时删除。

## 测试覆盖

- L1 内存缓存命中/未命中
- L2 IndexedDB 回退
- 网络成功/失败/非 image 类型
- in-flight 去重
- SWR stale 返回 + 后台刷新 + 失败保留 + 不撤销 stale URL
- 延迟 revoke（覆写 + LRU 淘汰 + clearAvatarCache 刷新）
- LRU 容量边界（201 条目）
- Generation token 竞态保护
- 缓存命中时 SWR 契约履行
- 本地像素头像确定性/大小写/边界
