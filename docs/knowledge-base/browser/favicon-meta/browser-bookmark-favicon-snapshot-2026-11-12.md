# 书签 favicon 重复转圈与导入图标快照（2026-11-12）

## 现象

从 Edge 导入书签后，右侧「浏览器」面板 → 自建目录 → 展开收藏目录：
每个书签行的网站图标先转圈约 5 秒才变首字母；**折叠再展开又从头转圈**。
导入文件里明明带 `ICON="data:image/png;base64,…"`，界面却完全不显示。

## 根因

1. `BrowserFavicon` 把「已结算但无图标」与「从未抓取」当成同一状态：
   `isLoading = !current && !degraded && !resolvedFaviconEmpty`，而 `resolvedFaviconEmpty`
   只由「站点元数据镜像已有条目」或 **5000ms 超时** 置位。
2. 导入书签在本机从未访问过，`siteMetaCache` 无条目 → 永远命中不了结算条件，
   只能等 5s 超时降级为首字母。
3. 树行折叠/展开会**重新挂载**组件，超时闩锁不保留 → 每次展开重新转圈。
4. `BookmarkEntry.iconUri` 在导入时已写入、导出时也在用，但**没有任何展示路径消费它**。

## 修复设计（双层图标模型）

| 层 | 角色 | 生命周期 |
| --- | --- | --- |
| `siteMetaCache`（共享镜像） | 真实图标真源（SQLite 持久化、引用计数、origin canonical） | 长驻 |
| `BookmarkEntry.iconUri` | 导入文件里的图标快照，兼跨会话持久化 | 随书签 |
| `BrowserFavicon.pending` | 由调用方声明占位语义 | 每次渲染 |

- **被动列表（书签/历史/收藏搜索结果行）**：`pending='initial'` → 首字母立即显示，不转圈、
  不挂 5s 计时器；真实图标（广播携带 data-URI）到达后原地替换。
- **活标签（标签条、已打开标签列表、树里的活标签行）**：默认 `pending='spinner'`。
- **导入即播种**：导入成功后把 `ICON` 快照写入共享镜像（只写镜像、不写后端），启动时在
  `subscribeSiteMetaReady` 之后从 store 重新播种（跨会话）。

## 两个关键坑

1. **不能把快照写进后端持久层**：`should_replace_favicon` 规定已有值以 `data:` 开头时
   **永不替换**；写进去会把旧快照永久锁死，真实抓取再也升不上去。快照真源留在书签，
   只进内存镜像；真实 data-URI 广播到达时由 `applyBroadcastUpdate` 覆盖。
2. **不能在镜像水合前播种**：`initSiteMetaCache` 只在 key 不存在时写入，提前播种会挡住
   持久层里的真实图标。播种门槛 = `ready` 之后 + 「该 key 既无 data-URI 也无 faviconUrl」。

## 测试与验证

- 回归保护从**公共组件入口**进入：`BrowserCategorySection` 展开目录断言书签行无
  `.adl-spinner` 且首字母可见；活标签行仍有 spinner；扁平搜索结果行同样覆盖。
- 启动播种、收集范围（嵌套目录 + 工作区书签）、非图片快照跳过、url-only 不覆盖均有单测。
- 变异验证：回退树行接线 / 删掉启动播种 / 删掉 url-only 守卫，对应用例均变红。
- 真实浏览器（`dev:preview` + playwright-cli）：展开 → 折叠 → 再展开，`spinners: 0`；
  带 `ICON` 的书签直接显示 data-URI 图标，无 `ICON` 的显示首字母。

## 教训

- **「空态」与「加载态」必须由调用方区分**：组件无法知道「是否真有在途抓取」，
  用超时兜底只会把状态机复杂度转移到用户可见的闪烁上。
- **持久层的「不可覆盖」规则要先查再设计写入路径**：把快照灌进共享缓存前，
  先确认真实数据仍能覆盖它。
