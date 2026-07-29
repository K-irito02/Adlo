# 头像缓存设计 — Gravatar/GitHub 头像两级缓存

**日期**：2026-07-30
**状态**：已批准
**背景**：承接 2026-07-30 的"像素头像优先显示"修复，本次为真实头像（GitHub/Gravatar）引入持久化缓存，避免每次访问分支图谱都产生网络开销。

## 目标

1. **缓存图片二进制数据**：命中时完全零网络请求
2. **按作者去重**：同一 email 只存一份，不同 size 通过内存 Blob URL 复用
3. **真实头像优先**：缓存命中真实头像时优先使用，未命中时显示本地像素头像
4. **SWR 过期语义**：过期不立即删除，等新数据成功获取后才替换
5. **零新依赖**：手写 IndexedDB 封装，不引入 `idb` 或 `fake-indexeddb`

## 非目标（YAGNI）

- UI 层"清除头像缓存"按钮（通过控制台调用即可）
- 缓存大小统计 UI
- 按工作区区分缓存（头像与工作区无关）
- Service Worker 层 HTTP 缓存

## 架构

### 两级缓存结构

```
组件 AuthorAvatar
  ├─ 同步显示本地像素头像（generatePixelAvatar，零网络）
  └─ 异步调用 getAvatar(email, size)
       │
       ▼
  avatarCache 模块
  ├─ L1: 内存 Map<email, AvatarEntry>  ← 即时命中，LRU+TTL
  │     - TTL: 7 天
  │     - LRU 上限: 200
  │     - 存 Blob URL（供 <img> 直接消费）
  │     - 淘汰时 revokeObjectURL 防泄漏
  │
  ├─ L2: IndexedDB (DB: adl-avatars)   ← 持久化，刷新后可用
  │     - Object Store: avatars, keyPath: email
  │     - 存原始 Blob（结构化克隆，零拷贝）
  │     - 容量 50MB+，200 张约 400KB
  │
  └─ L3: 网络请求（resolveAvatarUrl → fetch → Blob）
        - GitHub noreply → github.com/username.png
        - 其他 → gravatar.com（含 d=retro）
        - 成功 → 转 Blob 存入 L1+L2
        - 失败 → 返回 null（组件保持像素头像）
```

### 数据流（SWR — Stale-While-Revalidate）

1. 组件挂载 → 同步显示本地像素头像
2. 调用 `getAvatar(email, size)` → 查 L1 内存
3. **L1 命中且未过期** → 返回 Blob URL，组件替换像素头像
4. **L1 命中但已过期** → 立即返回旧 Blob URL，后台异步 revalidate
   - 后台成功 → 用新 Blob 更新 L1+L2，组件替换为新头像
   - 后台失败 → **保留旧条目**，下次再试
5. **L1 miss，L2 命中** → 加载到 L1，回到步骤 3/4 判断
6. **L1/L2 都 miss** → 从 L3 网络获取
   - 成功 → 存 L1+L2，组件替换
   - 失败 → 返回 null，组件保持像素头像

**关键语义**：过期条目在被新数据成功替换前永不删除。

## 数据结构

### IndexedDB Schema

```
数据库: adl-avatars (version 1)
Object Store: avatars
  keyPath: "email"
  无二级索引

记录结构:
{
  email: string           // 主键，已归一化（trim + toLowerCase）
  blob: Blob              // 图片二进制（MIME 从响应获取）
  fetchedAt: number       // 上次成功获取时间戳（ms）
  expiresAt: number       // 过期时间戳（fetchedAt + TTL）
  source: 'github' | 'gravatar'
}
```

### 内存 L1 层

```ts
type AvatarEntry = {
  blobUrl: string;        // 由 Blob 创建的 object URL
  fetchedAt: number;
  expiresAt: number;
  source: 'github' | 'gravatar';
};

const avatarMemoryCache = new Map<string, TTLCacheEntry<AvatarEntry>>();
```

**为何内存层存 Blob URL 而非 Blob**：`<img src>` 直接消费 URL，避免每次渲染重新创建/撤销。需在淘汰时 `revokeObjectURL` 防泄漏。

**为何 IDB 层存 Blob 而非 base64**：Blob 是 IDB 原生结构化克隆类型，零拷贝；base64 膨胀 33% 且需解码。

### 配置常量

```ts
const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 天
const AVATAR_LRU_LIMIT = 200;                    // 最多 200 个
const AVATAR_DB_NAME = 'adl-avatars';
const AVATAR_DB_VERSION = 1;
const AVATAR_STORE = 'avatars';
```

### 键归一化

```ts
function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}
```

与 `resolveAvatarUrl` 内部使用的归一化逻辑一致。空串返回空串。

## API 设计

### 模块导出（`avatarCache.ts`）

```ts
// 核心读取 — 组件唯一调用入口
export async function getAvatar(email: string, size: number): Promise<string | null>;

// 写入 — 仅供 getAvatar 内部和测试
export async function setAvatar(
  email: string,
  blob: Blob,
  source: 'github' | 'gravatar'
): Promise<void>;

// 清理
export function clearAvatarCache(): Promise<void>;
export function evictAvatar(email: string): Promise<void>;

// 调试
export function getAvatarCacheStats(): {
  memorySize: number;
  pendingRevalidations: number;
};
```

### `getAvatar` 内部流程

`getAvatar` 分两层：外层做同步 L1 检查 + in-flight 去重；内层 `doGetAvatar` 做 L2/网络查找。

```ts
// 外层：同步 L1 检查 + in-flight 去重
export async function getAvatar(email: string, size: number): Promise<string | null> {
  const key = normalizeEmail(email);
  if (!key) return null;

  // 同步查 L1（命中直接返回，含 SWR 过期语义）
  const memEntry = avatarMemoryCache.get(key);
  if (memEntry) {
    if (Date.now() <= memEntry.expiresAt) return memEntry.value.blobUrl;
    // 过期 — 返回旧值 + 后台刷新
    scheduleRevalidate(key, size);
    return memEntry.value.blobUrl;
  }

  // in-flight 去重：同一 email 并发调用只发一次网络请求
  if (inflight.has(key)) return inflight.get(key)!;
  const p = doGetAvatar(key, size).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// 内层：L2 + 网络查找
async function doGetAvatar(key: string, size: number): Promise<string | null> {
  // 2. L2 IndexedDB
  const dbEntry = await idbGet(key);
  if (dbEntry) {
    const blobUrl = URL.createObjectURL(dbEntry.blob);
    const entry: AvatarEntry = {
      blobUrl, fetchedAt: dbEntry.fetchedAt,
      expiresAt: dbEntry.expiresAt, source: dbEntry.source,
    };
    setMemoryEntry(key, entry);
    if (Date.now() <= entry.expiresAt) return blobUrl;
    scheduleRevalidate(key, size);
    return blobUrl;
  }

  // 3. 网络
  const result = await fetchAvatarFromNetwork(key, size);
  if (!result) return null;
  await setAvatar(key, result.blob, result.source);
  const fresh = avatarMemoryCache.get(key);
  return fresh ? fresh.value.blobUrl : null;
}
```

### 后台刷新 `scheduleRevalidate`

```ts
const pendingRevalidations = new Set<string>();

function scheduleRevalidate(key, size, staleEntry): void {
  if (pendingRevalidations.has(key)) return;
  pendingRevalidations.add(key);
  setTimeout(async () => {
    try {
      const result = await fetchAvatarFromNetwork(key, size);
      if (result) await setAvatar(key, result.blob, result.source);
      // 失败 → 保留旧条目，下次再试
    } finally {
      pendingRevalidations.delete(key);
    }
  }, 0);
}
```

**关键点**：
- `pendingRevalidations` Set 防止同一 email 并发刷新
- `setTimeout(0)` 异步执行不阻塞渲染
- 失败时不删除旧条目（符合用户要求）

### 网络获取 `fetchAvatarFromNetwork`

```ts
async function fetchAvatarFromNetwork(email, size) {
  const url = resolveAvatarUrl(email, size);
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size === 0 || !blob.type.startsWith('image/')) return null;
    const source = url.includes('github.com') ? 'github' : 'gravatar';
    return { blob, source };
  } catch {
    return null;
  }
}
```

### 并发去重

同一 email 同时多次调用 `getAvatar` 时，外层使用 `inflight` Map 去重（见上方 `getAvatar` 实现）。`doGetAvatar` 内部不再处理去重。

## IndexedDB 封装（手写，零依赖）

```ts
let dbPromise: Promise<IDBDatabase> | null = null;

function openAvatarDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(AVATAR_DB_NAME, AVATAR_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE, { keyPath: 'email' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<AvatarRecord | undefined> {
  try {
    const db = await openAvatarDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(AVATAR_STORE, 'readonly');
      const req = tx.objectStore(AVATAR_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch { return undefined; }
}

async function idbPut(record: AvatarRecord): Promise<void> { /* 同模式 */ }
async function idbDelete(key: string): Promise<void> { /* 同模式 */ }
async function idbClear(): Promise<void> { /* 同模式 */ }
```

**设计点**：
- 懒初始化：`dbPromise` 首次调用时创建
- 单例连接：缓存 Promise，后续复用
- 降级容错：所有 IDB 操作失败静默降级为仅内存缓存

## 清理策略

### 1. TTL 自动过期（SWR 语义）

**不主动扫描删除过期条目**。过期条目仅在以下时机处理：
- 读取时：`getAvatar` 检查 `expiresAt`，过期返回旧值 + 触发后台 revalidate
- revalidate 成功：`setAvatar` 用新数据覆盖（put 语义）
- revalidate 失败：保留旧条目，下次访问再试

### 2. LRU 容量淘汰（内存层）

自实现带 revoke 的 LRU 淘汰（不复用 `setCachedLruTTL`，因为后者淘汰时不调用回调）：

```ts
function setMemoryEntry(key: string, entry: AvatarEntry): void {
  const existing = avatarMemoryCache.get(key);
  if (existing && existing.value.blobUrl !== entry.blobUrl) {
    URL.revokeObjectURL(existing.value.blobUrl);
  }
  const ttlEntry: TTLCacheEntry<AvatarEntry> = {
    value: entry,
    expiresAt: Date.now() + AVATAR_TTL_MS,
  };
  avatarMemoryCache.set(key, ttlEntry);
  // LRU 淘汰
  while (avatarMemoryCache.size > AVATAR_LRU_LIMIT) {
    const oldest = avatarMemoryCache.keys().next().value;
    const old = avatarMemoryCache.get(oldest);
    if (old) URL.revokeObjectURL(old.value.blobUrl);
    avatarMemoryCache.delete(oldest);
  }
}
```

### 3. 手动清除

```ts
export async function clearAvatarCache(): Promise<void> {
  avatarMemoryCache.forEach((e) => URL.revokeObjectURL(e.value.blobUrl));
  avatarMemoryCache.clear();
  pendingRevalidations.clear();
  inflight.clear();
  await idbClear();
}

export async function evictAvatar(email: string): Promise<void> {
  const key = normalizeEmail(email);
  const entry = avatarMemoryCache.get(key);
  if (entry) {
    URL.revokeObjectURL(entry.value.blobUrl);
    avatarMemoryCache.delete(key);
  }
  await idbDelete(key);
}
```

UI 入口暂不新增（YAGNI），通过控制台调用。

## 组件改造

### `AuthorAvatar` 组件

```tsx
const AuthorAvatar = React.memo(function AuthorAvatar({ name, email, size = 20 }) {
  const pixelAvatar = useMemo(
    () => generatePixelAvatar(email ?? '', size),
    [email, size],
  );
  const [src, setSrc] = useState<string>(pixelAvatar);

  useEffect(() => {
    if (!email) { setSrc(pixelAvatar); return; }
    let cancelled = false;
    getAvatar(email, size).then((cachedUrl) => {
      if (!cancelled && cachedUrl) setSrc(cachedUrl);
    });
    return () => { cancelled = true; };
  }, [email, size, pixelAvatar]);

  return <img className="adl-author-avatar" src={src} alt={name} ... />;
});
```

### 预加载 effect

```ts
useEffect(() => {
  if (!adapted?.nodes) return;
  const emails = new Set<string>();
  adapted.nodes.forEach((n) => {
    if (n.authorEmail) emails.add(n.authorEmail);
  });
  emails.forEach((email) => {
    getAvatar(email, 32).catch(() => {});
  });
}, [adapted]);
```

## 错误处理边界

| 场景 | 处理 |
|------|------|
| IndexedDB 不可用 | 所有 IDB 操作返回 undefined，退化为仅内存缓存 |
| IDB 写入失败（配额超限） | 静默失败，不阻塞功能 |
| fetch 网络错误 | 返回 null，组件保持像素头像 |
| 响应非图片类型 | 返回 null |
| Blob 为空（size=0） | 返回 null |
| email 为空字符串 | 直接返回 null |
| 组件卸载后回调触发 | `cancelled` 标志位防止 setState |

## 双端一致性

- Tauri 模式：WebView2 支持 IndexedDB ✓
- 浏览器预览模式：Chrome 支持 IndexedDB ✓
- 两种模式下行为完全一致，无需 IPC 桥接

## 测试策略

### 单元测试（`avatarCache.test.ts`）

IDB mock：手写极简 mock（内存 Map 模拟），零新依赖。

| 测试组 | 用例 |
|--------|------|
| 归一化 | trim + toLowerCase、空串、undefined |
| L1 命中 | 未过期返回 blobUrl；过期返回旧值+触发 revalidate |
| L2 命中 | L1 miss + L2 未过期；L1 miss + L2 过期 |
| 网络回源 | L1/L2 miss → fetch 成功存入；fetch 失败返回 null；非图片返回 null |
| 并发去重 | 同一 email 并发只请求一次 |
| LRU 淘汰 | 超 200 条淘汰最旧 + revoke |
| SWR | revalidate 成功覆盖；失败保留旧条目 |
| 清理 | clearAvatarCache 全清；evictAvatar 单个清除 |
| 降级 | IDB 不可用退化为仅内存 |

### 集成测试（`BranchGraph.test.tsx`）

| 用例 |
|------|
| 初始渲染显示像素头像 |
| 异步加载后替换为真实头像 |
| 缓存命中时跳过网络 |
| 空邮箱保持像素头像 |

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `frontend/src/app/features/git-visualization/utils/avatarCache.ts` | 新增 |
| `frontend/src/app/features/git-visualization/utils/avatarCache.test.ts` | 新增 |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` | 修改（AuthorAvatar + 预加载 effect） |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx` | 修改（适配异步加载） |

`commitTooltipUtils.ts` 不变（`generatePixelAvatar` 和 `resolveAvatarUrl` 保持不变）。

## 性能影响

| 维度 | 评估 |
|------|------|
| 首次加载 | 与现状一致，多一次 IDB 写入（< 1ms） |
| L1 命中 | 零网络、零 IDB |
| L2 命中 | 零网络，IDB 读 < 5ms |
| 内存占用 | 200 张 ≈ 400KB |
| IDB 占用 | 200 张 ≈ 400KB（远低于 50MB） |
| 后台 revalidate | 过期触发一次网络，pending 防并发 |
