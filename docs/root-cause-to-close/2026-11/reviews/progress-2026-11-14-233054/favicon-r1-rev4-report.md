# R1 审查报告（rev4 复审）— favicon 子系统

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`
- 快照：`.review-diffs/*-rev4.diff`（本轮 rev4，只读）；清单 `.review-diffs/manifest-rev4.md`（66 文件）
- 需求/进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md` §P4
- 上一轮报告：`.review-diffs/favicon-r1-rev3-report.md`
- 实跑命令：**无**（未运行任何测试/门禁；测试有效性全部用「读用例 + 读实现」的删除性推演）

## 范围

rev4 相对 rev3 在 favicon 范围内**只改 4 个文件**（其余 favicon 相关文件 rev3/rev4 快照哈希一致）：

| 文件 | rev4 变动 |
| ---- | --------- |
| `adlo/frontend/src/app/components/BrowserFavicon.tsx` | 改：`urlRef`（render 期赋值）→ `probeUrlRef`（每次 `setProbeSrc` 同处写入）；`handleProbeLoad` 用 `probeUrlRef.current \|\| url`；complete 补检取 `probeUrlRef.current` 且为空时早退；相关注释重写 |
| `adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx` | 改：SSR 快照用例注释重写（`:271-272`）；其余 8 条「重挂不闪烁」用例与 rev3 一致 |
| `adlo/frontend/src/app/features/browser-tree/browserTreeFavicon.ts` | 改（**本轮新增的 favicon 行为**）：`faviconPropsForNode` 透传 `node.iconUri` 为 `snapshot`；被动判定注释改为「`isSavedBookmark` 优先」 |
| `adlo/frontend/src/app/features/browser-tree/__tests__/browserTreeFavicon.test.ts` | 改：新增「透传书签内联快照」用例；`tab` + `isSavedBookmark` 变体注释更新 |

未改（哈希与 rev3 一致，结论沿用）：`faviconDisplayCache.ts` 及其用例、`types.ts`、`useBrowserTreeData.ts`、`BrowserEntrySubEntries.tsx`、`browserTreeEntryUtils.tsx`、`utils/favicon.ts`、`utils/browserDisplayUtils.ts`、`files-navigator.css`、`BrowserTabBar.tsx`、`CenterTabStrip.tsx`、`BrowserNavListMode.tsx`、`BrowserNavTabsMode.tsx`、`BrowserOpenTabFlatListItem.tsx`、`CenterBrowserView.tsx`。

范围外但与之交互（属 bookmark-star / 列表窗口化审查范围，本文只记 favicon 影响）：`BrowserNavSearchMode.tsx`（搜索结果书签行 `nodeType` 改为 `'bookmark'`，被动判定仍成立）、`BrowserTreeEntryFlatList.tsx`（新增 80 行窗口化 → 行重挂更频繁，正好依赖本轮的「重挂不闪烁」保证）。

## 上轮问题关闭情况

### rev3 F1 low（`urlRef` 不是 probe 归属）— **已关闭**

逐项核对（行号见 `BrowserFavicon.tsx` 当前工作区源码）：

1. **`probeUrlRef` 与每个 `setProbeSrc` 同处写入 —— 11 个写入点全部成对，无遗漏**：
   - 初始：`:113` `useState(initial.probe)` ↔ `:130` `useRef(initial.probe ? url : '')`
   - URL/snapshot 变化清空：`:192-193`
   - 协调 effect：无候选 `:212-213`、`preferred === displaySrc` `:226-227`、就绪 `:231-232`、耗尽 `:253-254`、进 probe `:257-258`（`setProbeSrc(preferred)` + `probeUrlRef.current = url`，同一语句块相邻两行）
   - `handleProbeLoad` 成功后清空 `:322-323`；`handleProbeError` 耗尽清空 `:356-357`；`handleDisplayError` 重探 `:371-372`（+ `url`）；complete 补检清空 `:390-391`
   - 重试路径（`:334-343`）不改 `probeSrc`，因此归属保持不变 ✓
2. **`handleProbeLoad`（`:312-325`）**：`loaded = probeSrc`，归属 `probeUrlRef.current || url`；`markFaviconSourceLoaded` / `rememberPageFavicon` / `displayUrlRef` 全部按该归属写，不再用渲染期 `url` 直接当归属 ✓
3. **complete 补检（`:376-393`）**：`deps` 仍为 `[probeSrc, retryKey]`（无 `url`）；归属只取 `probeUrlRef.current`，为空时**直接 return**（比上一版更严）✓
4. **`handleProbeError`（`:327-358`）**：失败源用 `probeSrc`；耗尽分支只把 `displaySrc` 换成**本页**快照（`snapshot` 为本次渲染 prop）并认领 `displayUrlRef = url`，不会把旧 probe 的 src 记到新页 ✓
5. **`handleDisplayError`（`:360-374`）**：`forgetPageFavicon(displayUrlRef.current, failed)` 仍是「按归属 forget」，随后 `displayUrlRef = url` + `setDisplaySrc('')`，不存在「旧页图标留在新页名下」的顺序 ✓
6. **卸载语义**：卸载后 `<img>` 移除，不会再派发 load/error；`displaySrc` 的写入已在 remember effect 落账，无需额外清理；模块级缓存跨实例保留是设计意图 ✓
7. **「旧 probe 归属新页」可达性**：上一轮报告指出的「`probeSrc` 状态更新与父级 `url` 更新同批」路径已消除——任何同批渲染里 `probeUrlRef` 与 `probeSrc` 都来自同一次协调 effect 的配对写入。**同意「无公共 API 可达的竞态用例」**：RTL 里 `rerender` 会在 `act` 内 flush 副作用，旧 probe 在换页 commit 内即卸载；对已脱离文档的节点 `fireEvent` 不会冒泡到 React 19 的根事件监听器（事件委托），因此无法从公共入口构造该竞态。本项**接受「结构修复 + 注释」的关闭方式**。
   残留一条更窄的同族路径，另立新 F1（见下）。

### rev3 F2 low（SSR 快照用例注释与实现不符）— **已关闭**

1. **注释已改为事实**：`BrowserFavicon.test.tsx:271-272` 现写「删掉 `resolveInitialSources` 里的 `snapshotReady` 优先级后，快照既不在可见层也不在 probe 层（内联 data-URI 本来就 ready），SSR 输出会完全丢失该图标」——与 `BrowserFavicon.tsx:82-94` 一致（probe 分支的条件是 `meta && !metaReady` / `snapshot && !snapshotReady`，内联 data-URI 恒为 ready，故 probe 必为空）✓
2. **`toContain(data:)` 真的能拦住删掉优先级**：删除 `:86-88` 的 `snapshotReady` 分支后 `display = ''`（`remembered` 为空、`meta` 为空）、`probe = ''` → SSR 输出既无可见 `<img>` 也无 probe 层，`expect(html).toContain('data:image/png;base64,SS')`（`:280`）**变红**；`:282`（fallback 必须 `display:none`）同时变红 ✓
3. **`:281`（`not.toContain('--probe')`）** 在该前提下恒绿，属防御性冗余断言；注释已如实说明「快照既不在可见层也不在 probe 层」，不再宣称这条会变红 ✓
4. **实现侧注释同步修正**：`BrowserFavicon.tsx:381` 已改为「归属以 probe 自身的页面为准（`probeUrlRef` 与 `probeSrc` 同步写入）」，与代码一致 ✓

## 新增发现

### F1 [severity: low] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/BrowserFavicon.tsx:257-258`、`:192-193`、`:317`、`:377-393`
- 描述：`probeUrlRef` 修好了「归属来源」（不再用渲染期 `url`），但归属仍存在**一个可变 ref 里**，而 ref 是在**被动 effect 体内**被改写的，`probeSrc` 的 state 更新却要等下一次 commit 才反映到 DOM/probe 的 `src` 上。在「effect 已 flush、probe 新 src 尚未 commit」的调度间隙里，DOM 上挂着的仍是**旧 probe 元素**，其 `onLoad`/`onError` 闭包来自上一帧渲染（`probeSrc = A`），但 `probeUrlRef.current` 已被本帧 effect 改成 `B`（`:258` 协调 effect 写入 `url`）或 `''`。若此时 A 的图片恰好加载完成：
  - `handleProbeLoad`：`ownerUrl = probeUrlRef.current || url` → 取到 B（或落到 `:317` 的 `|| url` 兜底同样取 B）→ `rememberPageFavicon(B, A 的图标)` + `displayUrlRef = B` + `setDisplaySrc(A 的图标)`，即把上一站图标记到新站名下；若新页此后没有可用来源，该页在会话内会一直显示上一站图标（`rememberedSrc` 命中）。
  - complete 补检同理：`el` 仍是 A 的 probe（`complete/naturalWidth` 判的是 A），owner 却已是 B。
  - 与 rev3 F1 的区别：不是「用错真相源」，而是「ref 与已提交的 probe state 短暂不一致」；rev3 的修复无法覆盖这一层。
- 证据：
  - ref/state 分离：`:130`（`probeUrlRef`）、`:113`（`probeSrc`）；`:192-193`、`:257-258` 在 effect 体里写 ref，同时 `setProbeSrc` 只是排队更新。
  - 旧 probe 在该间隙仍挂载：`:426-438` 的探针 `<img>` 的 `src` 来自 `probeSrc` state，本帧未变即仍渲染 A。
  - `:317` 的 `|| url` 是唯一仍把渲染期 `url` 当 probe 归属的地方，且在不变量成立（`probeSrc` 非空 ⇒ `probeUrlRef` 非空，见上表 11 个写入点）时是死代码；一旦被走到就正好复现上面的错配。complete 补检（`:382-385`）已在 `ownerUrl` 为空时早退，两条路径的策略不一致。
  - 可达性：需要「页 A 的 probe 仍在途 → 用户换到页 B → A 的 load 在 effect flush 与下一次 commit 之间到达」。`setProbeSrc` 出自被动 effect（非 SyncLane），React 会在后续调度任务里提交，浏览器可在此期间派发图片事件，因此不是纯理论；但时间窗为一次调度间隙，极窄。**无法用公共 API 写用例**：换页 `rerender` 在 `act` 内会先把 probe 卸载，且已脱离文档的节点事件不会冒泡到 React 根监听器（与 rev3 F1 的不可测结论一致）。
- 建议修复：把「探针归属」和 `probeSrc` 合成**同一个 state**（如 `const [probe, setProbe] = useState<{ src: string; ownerUrl: string }>({ src: initial.probe, ownerUrl: initial.probe ? url : '' })`），所有 `setProbeSrc(x)` + `probeUrlRef.current = y` 改成 `setProbe({ src: x, ownerUrl: y })`；`handleProbeLoad` / complete 补检从**闭包里的 `probe`** 取 `{src, ownerUrl}`（闭包与已提交的 probe `<img>` 同源，天然一致），并删掉 `:317` 的 `|| url` 兜底。若暂不改，至少在 `:127-129` 与 `:381` 的注释里写明「归属为 effect 期写入的 ref，与已提交 probe 存在一个调度间隙的不一致」——但那是把已知缺陷写成注释，不建议。

## 记录不修

| # | 位置 | 内容 | 不修理由 |
| - | ---- | ---- | -------- |
| R1 | `BrowserFavicon.tsx:225-229` | `preferred === displaySrc` 早退不认领 `displayUrlRef`（同源导航时归属停留旧 URL） | 图标本身正确；后果仅新 URL 少一次记忆写入（rev2/rev3 同结论） |
| R2 | `BrowserFavicon.tsx:263-267` vs `:320` | 页面记忆写入两处（remember effect + probe onLoad） | 同键同值幂等；事件处写入让「本帧即生效」，effect 兜底 |
| R3 | `BrowserFavicon.tsx:247-256`、用例 `BrowserFavicon.test.tsx:367-404` | 耗尽分支「退回快照」仍无真正锁住它的断言（快照本来就已可见，删掉 `setDisplaySrc(snapshot)` 仍绿） | 用例注释已如实说明「真正锁住的是 probe 不再挂载」；该分支只在「旧来源已成功显示 → 换新来源 → 7 次失败」时可达，现网难构造 |
| R4 | `__tests__/faviconDisplayCache.test.ts:26-34` | 损坏内联 data-URI 只有模块级用例，缺组件级「第二次挂载不再直接可见」 | 模块语义已锁，组件调用点（`BrowserFavicon.tsx:77-88`）稳定 |
| R5 | `BrowserFavicon.tsx:238-256` | 导航到「本会话已失败/长期不可达」的 favicon 时，上一站图标保留到 6×2s 重试耗尽（约 12s） | 「过渡期保留旧图标」是用户要的无中间态；命中 `failedSources` 直接收尾属策略调整 |
| R6 | `BrowserFavicon.tsx:76`、`:90-94`、`:183` | `resolveInitialSources` 的 `preferred` 返回值冗余；`meta !== display` / `snapshot !== display` 与前面分支互为冗余 | 纯冗余，无行为影响（rev1–rev3 同结论） |
| R7 | `BrowserNavSearchMode.tsx:87-108` | 搜索结果节点仍不带 `iconUri`（本轮只是把 `nodeType` 改成 `'bookmark'`），导入书签的 `snapshot` 到不了搜索行，首帧仍露首字母 | 本轮改动属归属/菜单裁剪范围；`faviconPropsForNode` 已能透传，接一个字段即可，后续统一处理（rev2 R8 / rev3 R7 同项） |
| R8 | `browser-webview.css:354-357` | `.adl-filetree__item--evicted` 以更高特异性把 probe 层 `opacity` 提到 0.6 | 加载完成前 `<img>` 无内容可绘制，无可感知后果（rev2/rev3 同结论） |
| R9 | `favicon.ts:23-24`、`BrowserFavicon.tsx:75/80/137` | `resolveInitialSources` / 渲染体在渲染期读镜像与页面记忆（`getFaviconUrl` 触发预加载） | 重复代价已由缓存去重消除；渲染期读缓存正是「重挂不闪」的前提（rev2 F4 / rev3 R9 同结论） |
| R10 | `BrowserFavicon.tsx:206` | 孤立注释「说明：snapshot 变化时同样需要重置重试/耗尽状态」被放在 effect 之外（空行隔开），读起来像在解释下面的协调 effect | 内容本身准确（`snapshot` 确在 `:204` deps 里），纯排版问题 |
| R11 | `browserTreeFavicon.ts:26` | `node.iconUri` 未经 `data:image/` 校验即作为 `snapshot` 传入（导入文件的 `ICON` 可能是 http URL） | 非内联来源不会被 `isFaviconSourceReady` 判为就绪，只会进 probe 层按真实加载结果决定，`<img src>` 不执行脚本；与镜像播种侧的过滤策略差异不产生行为风险 |

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）
- rev3 的两条 low **均已关闭**：F1 的 11 个 `setProbeSrc` 写入点全部与 `probeUrlRef` 成对（含 URL 变化清空、协调 effect、display error 重探、卸载语义），`handleProbeLoad`/`handleProbeError`/complete 补检都按 probe 归属写记忆与 `displayUrlRef`，且同意该竞态无公共 API 可达、接受「结构修复 + 注释」；F2 的注释已与实现一致，删掉 `snapshotReady` 优先级后 `:280`/`:282` 会变红（`:281` 是防御性冗余，注释已如实说明）。
- 新增 1 条 low：归属仍是「effect 期改写的 ref」，与已提交 probe state 存在一个调度间隙的不一致（旧 probe 的 load 可能落到新页名下），建议把 `{src, ownerUrl}` 合成同一个 state 并删掉 `:317` 的 `|| url` 兜底；同样不可用公共 API 覆盖。
- 本轮新增的 favicon 行为（`faviconPropsForNode` 透传 `iconUri` 为 `snapshot`）与 `BrowserFavicon` 的快照优先级链路一致，`faviconPropsForNode` 用例（`browserTreeFavicon.test.ts:55-70`）删掉 `...(node.iconUri ? { snapshot: node.iconUri } : {})` 会因 `toEqual` 少键变红 ✓。
