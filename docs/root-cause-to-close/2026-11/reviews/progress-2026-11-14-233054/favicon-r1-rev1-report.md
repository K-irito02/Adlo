# R1 审查报告 — favicon 子系统（rev1）

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`
- 快照：`.review-diffs/*-rev1.diff`（本轮 rev1，只读）
- 需求/进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md`（P3 第二轮 / 第三轮、事项 4）
- 实跑命令：**无**（未运行任何测试/门禁；测试有效性判断全部为「读用例 + 读实现」的删除性推演）

## 范围

| 文件 | 关注点 |
| ---- | ------ |
| `adlo/frontend/src/app/components/BrowserFavicon.tsx` | 首帧解析、可见层/probe 层、重试预算、URL 变化、记忆写入 |
| `adlo/frontend/src/app/components/faviconDisplayCache.ts` | 模块级 loaded/failed/page 记忆、容量与错误共享 |
| `adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx` | 回归用例真实拦截力 |
| `adlo/frontend/src/app/features/browser-tree/browserTreeFavicon.ts` | `pending` 策略 + `snapshot` 透传 |
| `adlo/frontend/src/app/features/browser-tree/__tests__/browserTreeFavicon.test.ts` | 同上 |
| `adlo/frontend/src/app/features/browser-tree/useBrowserTreeData.ts` | `iconUri` → 树节点 |
| `adlo/frontend/src/app/features/browser-tree/types.ts` | `iconUri` 字段 |
| `.../BrowserEntrySubEntries.tsx` | 树行 favicon 渲染（`faviconPropsForNode`） |
| `.../BrowserTreeEntryFlatList.tsx` | 扁平列表 favicon 渲染（仅 favicon 部分） |
| `adlo/frontend/src/styles/regions/rightpanel/files-navigator.css` | 层叠布局、注释与实现一致性 |

## 上轮问题关闭情况

| 上轮项（进度文件） | 结论 | 理由 |
| ------------------ | ---- | ---- |
| ① favicon 首帧/重挂不闪：lazy state 同步读缓存、模块级 loaded src、页面 URL 记忆、可见层+probe 层、快照立即显示、重试耗尽退回快照 | **部分关闭** | 实现均在位且重挂路径（同一 URL 卸载/重挂）成立；但「按页面 URL 记忆」缺少归属校验，URL 变化时会把旧站图标记到新 URL 名下 → 见 F1。首帧（render 期解析）本身无有效回归保护 → 见 F2。 |
| ② 导入书签 `iconUri` 从树节点传到 `BrowserFavicon` | **已关闭** | `types.ts:33` 新增字段；`useBrowserTreeData.ts:144/157/252` 三条构建路径（纯书签、tab 背书书签、工作区书签）都赋值；`browserTreeFavicon.ts:25` 只在有值时透传（`toEqual` 用例验证无值时不带 key）；`BrowserEntrySubEntries.tsx:240`、`BrowserTreeEntryFlatList.tsx:170` 都走 `faviconPropsForNode`，扁平项复用同一 node 对象，`iconUri` 不会被丢弃。 |
| ③ 相关单测能否拦住回归（删除性推演） | **未关闭** | 见 F2：核心「首帧不闪」用例在 RTL `act` 下无法区分 lazy 初始化与 effect 初始化；「重试耗尽退回快照」的可视断言是空断言；`failedSources` / `forgetPageFavicon` 无任何用例覆盖。 |
| ④ 注释/文案绝对断言、死代码、重复状态、竞态、缓存无界、样式层叠与 a11y | **未关闭** | 模块缓存有 4000 上限、计时器在卸载时清理、probe 层 `aria-hidden` 均无问题（记录）；但 CSS 注释仍宣称「淡入」（已删除 transition）→ F3；渲染期调用带副作用的 `getFaviconUrl` → F4。其余进「记录不修」。 |
| ⑤ 预存问题（本范围内） | 见记录 | 双份 `faviconUrl` state/ref、`resolveInitialSources` 冗余条件、搜索行不带 `iconUri`、evicted 行覆盖 probe 透明度。 |

**核对过且无问题的点**（避免下一轮重复审）：

- 缓存容量：`loadedSources` / `failedSources` / `pageDisplaySources` 均为 4000 上限 FIFO 淘汰（`faviconDisplayCache.ts:45-52/63-69/76-82`），不会无界增长。
- 卸载竞态：重试计时器在 URL 变化、meta 变化、卸载三处清理（`BrowserFavicon.tsx:183/248/311`），超时回调内读 `faviconUrlRef` 拿最新值，不会用 await 前快照写回。
- 广播订阅：`subscribeSiteMetaGlobal` 按 `normalizeUrlForCache(url)` / `getRedirectTarget(url)` 过滤，卸载有 `unsubGlobal`（`BrowserFavicon.tsx:262-270`）。
- 层叠布局：`.adl-filetree__file-icon{position:relative}` + `.adl-browser-tree__favicon{position:absolute}` 给可见层/probe 层提供了同一锚点，两层互相覆盖、不占额外布局；`alt=""`（可见层）+ `aria-hidden`（probe 层）语义正确。
- 测试用自有属性键：本范围没有「以运行时值为键查对象字面量」的写法；`faviconPropsForNode` 用例走 `toEqual`，不涉及 `constructor`/`__proto__` 原型链风险。

## 新增发现

### F1 [severity: high] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/BrowserFavicon.tsx:240-245`（记忆写入）、`172-199`（URL 变化）、`80-88` 与 `204-238`（记忆读取/回填）、`319-325`（重试耗尽）
- 描述：模块级「页面 URL → 上次成功显示的图标」没有登记该图标**属于哪个页面**。同一组件实例换 URL（标签页导航，`BrowserTabBar.tsx:102` / `BrowserOpenTabFlatListItem.tsx:51` / `CenterTabStrip.tsx:553` 都按 `tab.id` 复用实例、只换 `url`）时，`displaySrc` 按设计被保留（旧图标继续可见，无首字母中间态），但紧接着的 remember effect 会用**新 URL** 去记**旧站图标**；随后协调 effect 又把这个被污染的记忆回填成可见层。结果：新页面在「元数据暂缺 / 结算为无图标 / 图标长期失败」时永久显示上一站的 favicon（`showImg` 为真，首字母与兜底都不会出现），并且被污染的条目会覆盖真正正确的元数据首帧（`resolveInitialSources` 里 remembered 优先于 meta），多出一次「错图标 → 正确图标」翻转。这不是「无闪烁」的取舍问题，而是错图标；污染按每次导航累积，命中全部消费方（树行、书签列表、标签栏）。
- 证据：
  - `BrowserFavicon.tsx:241-245` 只有 `if (displaySrc)` 与 `[url, displaySrc]` 两个条件，没有「`displaySrc` 是否为当前 `url` 解析出来的」校验。
  - 同一 commit 内被动 effect 按声明顺序执行：`172-199` 的 `setDisplaySrc(...)` 只是排队更新，`241-245` 的 remember effect 仍拿到**本帧**的旧 `displaySrc` → 写入 `(新 url, 旧图标)`。
  - `204-238` 在 `preferred === ''` 时执行 `if (isFaviconSourceReady(rememberedSrc)) setDisplaySrc(rememberedSrc)`；`80-88` 在首帧也把 remembered 排在 meta 之前 → 污染值会被立刻当真。
  - `319-325` 重试耗尽分支只尝试退回 `snapshot`，从不清掉「属于别的页面」的 `displaySrc`，所以新站图标 404 / 抓取失败时旧站图标不会退出。
  - 现有用例里没有任何 URL 变化的用例（`BrowserFavicon.test.tsx` 全部是固定 `url`），因此该路径零覆盖。
- 建议修复：给可见来源加归属（例如 `const [display, setDisplay] = useState({ url, src: initial.display })`，或在所有「为当前页设值」的地方同步写 `displaySrcUrlRef.current = url`），只在 `display 归属 url === 当前 url` 时才 `rememberPageFavicon`；并在 URL 变化后「重试耗尽 / 结算为无图标 / 无任何候选来源」三个分支里，若 `displaySrc` 归属 ≠ 当前 `url` 则清空为 `snapshot`（就绪时）或 `''`。补一条回归：`render(url=A)` → load → `rerender(url=B)`（B 无元数据）→ 断言 `getRememberedPageFavicon(B) === ''` 且 `visibleImg === null`。

### F2 [severity: medium] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx:253-337`
- 描述：本轮四条修复的核心断言里，至少两项**删掉实现也不会变红**，不构成回归保护：
  1. 「首帧直接显示」类用例（`:254-267`、`:269-288`、`:290-302`）断言的是 `render()` 返回后的 DOM。RTL 的 `render` 包裹 `act`，会在返回前 flush 被动 effect 与随之而来的 state 更新，所以把 `BrowserFavicon.tsx:107` 的 lazy `useState(() => resolveInitialSources(...))` 改回「初值空 + effect 里读缓存」，这些断言仍然全绿——而「首帧不闪」正是只能在 effect 之前生效的修复。
  2. 「重试耗尽退回快照」（`:304-336`）里 `visibleImg` 从渲染第一帧起就是快照（`BrowserFavicon.tsx:228-229` 已设 `displaySrc = snapshot`），因此删掉 `319-324` 的 `setDisplaySrc(snapshot)` 三条语句，`:330-331` 依然通过——真正被拦住的是 `setExhaustedSrc`（对应 `:332` 的 `probeImg === null`）。用例名与断言不对应。
  3. `markFaviconSourceFailed` / `failedSources`（损坏内联 data-URI 不再重复展示）与 `forgetPageFavicon`（显示失败后清页面记忆）没有任何用例覆盖：删掉两处调用，`BrowserFavicon.test.tsx` 全绿（`:112-128` 断言的只是 `degraded` 闩锁 + 首字母文本）。
- 证据：`BrowserFavicon.test.tsx:256-266` 无任何「不 flush effect」的手段（无 `renderToStaticMarkup`、无 render 期探针）；`:319-332` 的可见断言与初始状态相同；全文件 grep 无 `failedSources` / `forgetPageFavicon` 相关断言（`faviconDisplayCache` 只有 `__resetFaviconDisplayCacheForTest` 与 `getRememberedPageFavicon` 被引入）。
- 建议修复：首帧改用 `react-dom/server` 的 `renderToStaticMarkup`（effect 不执行）断言「记得的 src / 快照」在首帧输出里就是 `<img>`；把「耗尽退回快照」用「快照不是初始来源」的构造（例如先只有 meta、耗尽后再出现 snapshot）重写，或直接断言快照来源被保留下来的具体 node；补 `failedSources`（同一损坏 data-URI 第二次挂载不再直接可见）与 `forgetPageFavicon`（显示失败后 `getRememberedPageFavicon` 为空）两条用例。

### F3 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/styles/regions/rightpanel/files-navigator.css:300`
- 描述：本轮新增注释「叠在兜底首字母之上：加载期首字母始终占位，图片解码完成后再淡入，避免闪烁」与实现不符：本轮同时删掉了 `BrowserFavicon.tsx` 里 `transition: 'opacity 0.15s ease-in-out'`（diff 中原 `style={{ ... transition ... }}` 被删），CSS 也没有任何 transition/animation，图片是加载完成后**直接出现**，不「淡入」；「加载期首字母始终占位」也不成立——有快照或已记住的图标时首字母根本不出现（`BrowserFavicon.tsx:365-366`）。属于「把意图写成事实」的绝对断言。
- 证据：`files-navigator.css:299-315`（可见层 + probe 层）没有任何 `transition`/`animation`；该文件内 3 处 `transition` 全在行悬停/折叠（`:88/:169/:233`）；`browser-webview.css:354-357` 的过渡只作用于 evicted 行透明度；`BrowserFavicon.tsx:372-381` 的可见 `<img>` 无过渡样式（本轮 diff 删除了原 `transition: 'opacity 0.15s ease-in-out'`）。
- 建议修复：改为「绝对定位叠在兜底首字母之上；只有加载成功（或内联快照）的来源才进入可见层，因此不出现图层闪烁」，删除「淡入」与「始终占位」措辞。

### F4 [severity: low] [category: 副作用]

- 位置：`adlo/frontend/src/app/components/BrowserFavicon.tsx:74-96`（`resolveInitialSources` 调 `getFaviconUrl`）、`:107`（`useState` 初始化器）、`:141`（`applyMetaUpdate`）、`:173`
- 描述：`resolveInitialSources` 现在在**渲染期**（`useState` 惰性初始化器 + 每次 URL 变化的 effect）调用 `getFaviconUrl`，而该函数不是纯查询：命中「只有外部 HTTP URL」分支时会调用 `preloadExternalFavicon`，创建 `<img>`、`OffscreenCanvas` 转码并经 `persistFaviconDataUri` 落盘。渲染期副作用在 StrictMode 下会被双调用，叠加 `applyMetaUpdate`/URL effect 的调用，同一次挂载最多触发 3–4 次预加载；`preloadExternalFavicon` 只有「成功后写入 `preloadCache`」的守卫，没有在途去重，因此会重复建 `Image`、重复 `persistFaviconDataUri` 写库（有外部 favicon URL 的书签/标签越多，越明显）。
- 证据：`adlo/frontend/src/app/utils/favicon.ts:88-106`（`preloadExternalFavicon(...)` 在 `getFaviconUrl` 内被调用）、`favicon.ts:34-39`（仅 `preloadCache.has` 守卫，无 pending 集合）；`BrowserFavicon.tsx:107` 的初始化器在 render 期执行。
- 建议修复：渲染期只做无副作用查询（例如导出 `peekFaviconUrl`：只读 `getCanonicalOriginFavicon` + `preloadCache`，不触发预加载），把 `preloadExternalFavicon` 留给 effect；或在 `preloadExternalFavicon` 里加在途 Set 去重。

## 记录不修

| # | 位置 | 内容 | 不修理由 |
| - | ---- | ---- | -------- |
| R1 | `BrowserFavicon.tsx:74-96`、`:176-179` | `resolveInitialSources` 返回的 `preferred` 只服务一个布尔判断，且 `&& !initial.meta` 在 `!preferred` 成立时恒为真；`176-179` 与 `117-118` 是同一表达式复制 | 纯冗余/死条件，删除不改变行为；改动点在热路径上，留给下次触碰该文件时顺手清理 |
| R2 | `BrowserFavicon.tsx:108/115` | `faviconUrl` state 与 `faviconUrlRef` 双份状态 | 预存设计：ref 供 5s 超时回调读最新值，function 语义不同，合并会引入 stale read 风险 |
| R3 | `BrowserNavSearchMode.tsx:90-104` | 搜索结果节点不填 `iconUri`（纯收藏行 `nodeType:'tab'` + `isSavedBookmark`），导入书签在搜索里仍先露首字母 | 与进度文件「搜索外的树行」口径一致；首次加载成功后由 `pageDisplaySources` 兜住后续重挂；搜索是临时节点，另开事项处理更合适 |
| R4 | `browser-webview.css:354-357` | `.adl-filetree__item--evicted .adl-browser-tree__favicon{opacity:.6}` 以更高特异性命中 probe 层，使「probe 不可见」在 evicted 行失效 | 加载完成前 `<img>` 无内容可绘制（`alt=""`），实测无可感知后果；仅记录层叠脆弱性，建议后续在该选择器加 `:not(.adl-browser-tree__favicon--probe)` |
| R5 | `BrowserFavicon.tsx:301-326` | 确定性失败（损坏的内联 data-URI）仍走 6×2s 重试预算 | 有界、单次挂载内最多 7 次本地解码尝试，随卸载清理，无实际代价 |
| R6 | `faviconDisplayCache.ts:12-23` | 三个 Set/Map 均为 FIFO 淘汰而非 LRU；`pageDisplaySources` 直接存 data-URI 字符串 | 4000 上限足够覆盖 311 条导入 + 历史；字符串为引用复用（真源仍在书签数据里），当前规模无内存风险 |
| R7 | `BrowserFavicon.tsx:362-366` | spinner 模式下「有 favicon 但未加载」时不再转圈、直接显示首字母 | 本轮有意的取舍（避免「转圈→字母→图标」），且用户验收的正是这条路径；不视为缺陷 |

## 结论

- 需修复项：4（critical 0 / high 1 / medium 1 / low 2）
- 说明：F1 为跨页面图标泄漏（错误图标，非闪烁取舍问题），建议本轮内修并补 URL 变化回归；F2 是「测试有效性」强制项（首帧与耗尽退回快照两条断言当前拦不住回归）；F3/F4 为 low（错误注释、渲染期副作用）。
