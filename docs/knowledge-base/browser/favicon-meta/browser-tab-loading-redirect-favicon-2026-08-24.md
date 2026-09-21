# 浏览器面板标签加载状态与跨域重定向 favicon 处理

## 日期
2026-08-24

## 涉及功能
1. 标签页加载状态：favicon 加载中 spinner + 标题未结算时"新建标签页"扫光动效（`titleResolved` 字段）
2. 搜索引擎 favicon/标题获取与闪烁修复
3. Marginalia 跨域重定向历史记录 favicon 永久 spinner（方案 A 历史 URL 回写 + 方案 B redirectMap 兜底）

## 核心设计

### titleResolved 状态机
- `BrowserTabState.titleResolved: boolean`：标题是否已"结算"（真实标题到达）
- 未结算 → 标签栏显示 `ShimmeringText("新建标签页")` 扫光；已结算 → 显示真实标题
- 初始化判定统一走 `isRealTitle(title, url)` helper（`!isPlaceholderTitle` 语义）：
  - 真实非占位标题（iframe document.title / 书签 / 用户重命名 / 刷新）→ `titleResolved: true`
  - 占位标题（空 / URL / 裸主机名 / 无 scheme 标签如 `douyin.com/jingxuan`）→ 保持未结算
- 水合归一化：旧持久化数据缺 `titleResolved` 字段时按 `isRealTitle` 补默认值，避免恢复的 tab 全部扫光

### 跨域重定向 favicon（参考 Chrome/Edge 重定向链消化语义）
问题：`search.marginalia.nu` 302 到 `marginalia-search.com`（不同 origin），元数据只缓存于目标 origin，历史条目保留原始 URL → favicon 永久 spinner。

- **方案 A（历史 URL 回写）**：`browserUpdateHistoryUrl` 按 dedupKey 把历史条目 URL 回写为最终 URL（仅最新条目，保留更优标题），历史树直接命中缓存
- **方案 B（redirectMap 兜底）**：`recordRedirect` 记录 `原始URL → 最终URL` 会话级映射（500 FIFO 上限、visited-set 环检测），`getFaviconUrl` 直接查找 miss 时回退到目标 URL 缓存
- **检测机制**：`expectedNavigationUrlRef = {url, at, tabId}` 只在显式导航入口设置（地址提交/树点击），绑定发起 tab id + 10s 新鲜度窗口 + 跨站判定，消费后立即清空
- 5s 超时降级：URL 永不结算时显示站点首字母兜底

## 经验教训

1. **跨域重定向是 favicon/标题查找 miss 的隐蔽根因**：元数据按 origin 缓存，重定向后历史条目保留原始 URL 就会 miss。参考 Chromium `icon_mapping.page_url_type` 语义，用重定向映射兜底而非盲目加超时。
2. **`expectedNavigationUrlRef` 必须绑定发起 tab id**：若不绑定，后台池化 WebView 的跨站事件（YouTube SPA 推进）会在窗口内误判为重定向 → 改写真实历史条目 URL。tabId:null 的"新建 tab"场景也需在创建后回读新 id 重绑。
3. **重定向检测的期望值必须"只用一次"**：消费后立即清空，否则陈旧期望会污染后续链接点击/后退/前进的 URL 变化。
4. **titleResolved 初始化必须统一**：多处内联判定（`!== url && !/^https?:\/\//`）会漏掉裸主机名/无 scheme 标签等占位类别。收敛到单一 `isRealTitle` helper，与 `applyBroadcastTitle` 的 `isPlaceholderTitle` 语义一致。
5. **favicon degraded（img 加载失败）后必须显示兜底字母**：HTTP URL 直显使 404 场景更常见，`showLetter = resolvedFaviconEmpty || degraded` 防止图标槽位空白。
6. **favicon 订阅从精确退化为全局广播时需注意性能**：全局订阅回调收到的是已归一化 cache key，直接用 `normUrl` 比较避免重复 URL 解析；双重订阅（全局 + pageMetaClient.subscribeUpdated）会造成同次广播冗余触发。

## 相关文件
- `frontend/src/app/components/BrowserFavicon.tsx`
- `frontend/src/app/utils/favicon.ts`
- `frontend/src/app/utils/siteMetaCache.ts`
- `frontend/src/app/utils/browserDisplayUtils.ts`（`isRealTitle` / `isPlaceholderTitle`）
- `frontend/src/app/features/browser/useBrowserUrlChange.ts`
- `frontend/src/app/stores/slices/browserHistorySlice.ts`（`browserUpdateHistoryUrl`）
- `frontend/src/app/features/browser/browserUrlUtils.ts`（`ExpectedNavigation` 共享类型）
- `frontend/src/app/features/browser/useBrowserSearch.ts`
