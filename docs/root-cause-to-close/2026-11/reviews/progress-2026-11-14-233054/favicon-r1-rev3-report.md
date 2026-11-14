# R1 审查报告（rev3 复审）— favicon 子系统

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`
- 快照：`.review-diffs/*-rev3.diff`（本轮 rev3，只读）；清单 `.review-diffs/manifest-rev3.md`（63 文件）
- 需求/进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md` §P4（`R1 rev2` 段 + 4d/4e 修复记录）
- 实跑命令：**无**（未运行任何测试/门禁；测试有效性全部用「读用例 + 读实现」的删除性推演）

## 范围

| 文件 | rev3 变动 |
| ---- | --------- |
| `adlo/frontend/src/app/components/BrowserFavicon.tsx` | 改：新增 `urlRef`；complete 补检改 `ownerUrl` + 依赖收敛为 `[probeSrc, retryKey]` |
| `adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx` | 改：新增「SSR 首帧输出书签内联快照」用例 |
| `adlo/frontend/src/app/components/faviconDisplayCache.ts`、`__tests__/faviconDisplayCache.test.ts` | 未改（rev2/rev3 快照哈希一致） |
| `adlo/frontend/src/app/features/browser-tree/browserTreeFavicon.ts`、`types.ts` | 未改 |
| `adlo/frontend/src/app/features/browser-tree/useBrowserTreeData.ts` | favicon 相关（`iconUri` 传播）未改；本轮改动属 `bookmarkUrlKey` 口径（收藏星范围），已确认不影响 favicon |
| `adlo/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx`、`BrowserTreeEntryFlatList.tsx`（favicon 部分） | 未改 |
| `adlo/frontend/src/styles/regions/rightpanel/files-navigator.css` | 未改 |
| `adlo/frontend/src/app/utils/favicon.ts`（rev2 F4 落点） | 未改 |

## rev2 问题关闭情况

### rev2 F1 medium（complete 补检换页竞态）— **主路径已关闭**

核对点与结论：

1. **依赖是否正确**：`BrowserFavicon.tsx:365-377` 的 deps 现在是 `[probeSrc, retryKey]`，`url` 已移出。换 URL 的 commit 里 `probeSrc`/`retryKey` 都还没变（`setProbeSrc('')` 只是 `:190` 的排队更新），因此该 effect **不会在换页 commit 执行**，「上一帧 probeSrc + 新 url」的配对条件不再成立。这是本次修复的关键，已生效。
2. **归属是否只用本次 probe 的 url**：`urlRef.current = url` 在 render 期赋值（`:127-128`），effect 运行时等于「本帧渲染的 url」。`probeSrc` 的非空写入点只有：`initial.probe`（挂载，属挂载 url）、`:250`（`preferred = faviconUrl || snapshot`，属本帧 url）、`:360`（`preferredSrc`，属本帧 url）；`:190/209/222/226/247` 均为置空（被 `&& probeSrc` 守卫挡住）。在这些路径下 `ownerUrl` 与 `probeSrc` 的页面一致。
3. **probe onLoad**（`:304-315`）：换页时 `:190` 清空 probeSrc → probe `<img>` 卸载，旧帧的 onLoad 闭包不会跨页执行；同一元素只因 `retryKey` 重挂（url 不变）。
4. **probe onError**（`:317-347`）：不写页面记忆；唯一的 `displayUrlRef.current = url` 位于「清掉旧页图标」分支（`:338-345`），方向安全。
5. **display onError**（`:349-362`）：`forgetPageFavicon(failedUrl, failed)` 用 `displayUrlRef.current` 而非渲染期 `url` ✓（`:351-354`），这是 rev2 建议的核心点，已落地。
6. **remember effect**（`:255-259`）：deps 只有 `[displaySrc]`，键取 `displayUrlRef.current`；我逐个核对了所有 `setDisplaySrc` 调用点（`:193-197`、`:212-217`、`:227-228`、`:234-239`、`:244-245`、`:310`、`:342`、`:356`、`:372`），**每一处都在同一语句块内先认领归属**，不存在「改了可见源、归属还是旧页」的顺序。
7. **URL 变化 effect**（`:177-201`）：两条分支都认领归属；「有候选但未就绪 → 保留旧图标过渡」分支故意不认领（`:199` 注释与实现一致）。

残留：`urlRef` 记录的是「本帧渲染 url」，不是 probe 自带的归属；在「url prop 与 probeSrc 状态同批渲染」的批处理路径下仍可配对错页，且该竞态没有任何用例守护 → 新增 F1（low，硬化项，非主路径）。

### rev2 F2 low（SSR 快照首帧断言）— **已关闭**

`BrowserFavicon.test.tsx:270-283` 新增 `renderToString`（不执行 effect）用例。删除性推演：把 `resolveInitialSources` 的 `snapshotReady` 分支去掉后 `display = ''`，且 `probe` 仍为 `''`（probe 分支要求 `!snapshotReady`，而新鲜的内联 data-URI 是 ready 的）→ SSR 输出既无可见 `<img>` 也无 probe 层、首字母可见 → `:280`（`toContain('data:image/png;base64,SS')`）与 `:282`（fallback `display:none`）**变红** ✓。断言有效，快照首帧路径已有可失效保护。

附带问题：`:271-272` 对失效机制的描述与实现不符，见新增 F2。

## 新增发现

### F1 [severity: low] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/BrowserFavicon.tsx:127-128`、`:365-377`；用例缺口在同文件 `__tests__/BrowserFavicon.test.tsx`
- 描述：`urlRef` 是「每次渲染都覆写的最近 url」（`urlRef.current = url` 写在 render 期），不是「这个 probeSrc 属于哪一页」的记录。当前主路径靠 deps 门控（`[probeSrc, retryKey]`）保证了二者一致，但仍有一条批处理路径可失配：若 `probeSrc` 的状态更新（如 `:250` 为 A 页写入 preferred）与父级 `url` prop 的更新（A→B）落到**同一次渲染**，该渲染的 `probeSrc` 还是 A 页来源、`urlRef.current` 已是 B，effect 因 deps 变化而执行，complete 命中时就会 `rememberPageFavicon(B, A 的图标)` + `displayUrlRef.current = B` + `setDisplaySrc(A 的图标)`——与 rev2 F1 同类后果（跨页错图标 + 污染记忆），只是触发面更窄。另外 render 期写 ref 在并发渲染（被放弃的渲染）下会把从未提交的 url 写进 ref。
  同时该竞态**没有任何回归用例**：把 `:377` 的 deps 改回 `[…, url]`、或把 `:371` 换回渲染期 `url`，现有 21+ 用例全绿（`:321-338` 的换 URL 用例在 rerender 时 `probeSrc` 已为空，补检 effect 直接短路）。
- 证据：`BrowserFavicon.tsx:127-128`（render 期赋值）、`:371-373`（用 `urlRef.current` 写记忆与归属）、`:377`（deps 不含 url）；`:250`/`:360` 是 probeSrc 的唯一非空写入点；`BrowserFavicon.test.tsx` 全文没有对 `complete`/`naturalWidth` 的桩化，也没有「probe 在途时换 URL」的用例。
- 建议修复：把归属记在 probe 上而不是渲染 url 上——新增 `const probeUrlRef = useRef(url)`，在 `:250`/`:360`（以及挂载处）设置 `probeSrc` 的同处写 `probeUrlRef.current = url`，补检里用 `probeUrlRef.current` 写 `displayUrlRef`/记忆并要求它等于 `url`；顺带删掉 render 期写 `urlRef`（若仍需要「最新 url」，用 `useLayoutEffect` 同步）。补一条用例：挂载 A（有 meta favicon、未 load）→ 桩化 `probeImg.complete = true / naturalWidth = 16` → `rerender(url=B)` → 断言 `getRememberedPageFavicon(B) === ''` 且可见图标不是 A 的 src（该用例在 rev2 实现下会红、rev3 实现下通过，能真正锁住这类回归）。

### F2 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx:271-272`；相关断言 `:281`；同类措辞 `adlo/frontend/src/app/components/BrowserFavicon.tsx:370`
- 描述：两处注释把「实现机理」写成了事实，但与代码不符：
  1. 用例注释称「删掉 `snapshotReady` 优先级后，快照会落到 probe 层，SSR 输出就会带上 `--probe` 类而可见层为空」。实际删除该优先级后 `resolveInitialSources` 的 probe 分支（`BrowserFavicon.tsx:89-94`）要求 `!snapshotReady`，而新鲜内联 data-URI 是 ready 的 → probe 仍为 `''`，SSR 输出是「无 `<img>`、首字母可见」，并不会出现 `--probe`。因此注释所对应的那条断言 `:281`（`not.toContain('--probe')`）在退化下**不会变红**；真正拦住退化的是 `:280`/`:282`。
  2. `BrowserFavicon.tsx:370` 写「只用本次 probe 的归属 URL」，但 `urlRef` 是「本帧渲染的 url」，两者只是恰好相等（靠 deps 门控），不是 probe 归属（见 F1）。
- 证据：`BrowserFavicon.tsx:76-94`（`snapshotReady` 与 probe 分支的互斥条件）；`BrowserFavicon.test.tsx:273-282`（先断言含 data-URI，再断言无 `--probe`，两条在本用例前提下互为冗余）；`BrowserFavicon.tsx:127-128` 与 `:371`。
- 建议修复：注释改为「删掉 `snapshotReady` 优先级后首帧既无可见层也无 probe 层、首字母外露，`:280`/`:282` 会变红」，并说明 `:281` 是防御性冗余断言；`:370` 改为「用本帧渲染的 url（deps 已排除 url，换页 commit 不会执行本 effect）」或按 F1 改成真正的 probe 归属。

## 记录不修

| # | 位置 | 内容 | 不修理由 |
| - | ---- | ---- | -------- |
| R1 | `BrowserFavicon.tsx:221-224` | `preferred === displaySrc` 早退不认领 `displayUrlRef`（同源导航时归属停留旧 URL） | 图标本身正确；后果仅新 URL 少一次记忆写入，误 forget 的目标已被 `markFaviconSourceFailed` 全局撤销就绪性而失去意义（rev2 R1 同结论） |
| R2 | `BrowserFavicon.tsx:255-259` vs `:311` | 页面记忆写入两处（remember effect + probe onLoad） | 同键同值幂等；事件处写入让「本帧即生效」，effect 兜底 |
| R3 | `BrowserFavicon.tsx:343-345` | 耗尽分支「退回快照」（`owner === url` 的 else-if）仍无用例 | 只在「旧来源已成功显示 → 换新来源 → 6 次失败」时可达，现网难构造；注释已如实说明真正被锁住的是「probe 不再挂载」 |
| R4 | `__tests__/faviconDisplayCache.test.ts:26-34` | 损坏内联 data-URI 只有模块级用例，缺「第二次挂载不再直接可见」的组件级回归 | 模块语义已锁，组件侧调用点（`BrowserFavicon.tsx:77-88`）稳定，重复覆盖价值低 |
| R5 | `BrowserFavicon.tsx:232-251` | 导航到「本会话已失败/长期不可达」的 favicon 时，上一站图标会保留到 6×2s 重试耗尽（约 12s） | 「过渡期保留旧图标」是用户要的无中间态；可后续把命中 `failedSources` 视为无图标直接收尾，属策略调整 |
| R6 | `BrowserFavicon.tsx:76`、`:117`、`:183` | `resolveInitialSources` 的 `preferred` 返回值/`!initial.meta` 冗余；与 URL effect 里同一表达式重复 | 纯冗余，无行为影响（rev1/rev2 同结论） |
| R7 | `BrowserNavSearchMode.tsx:90-109`（rev3 仅改 `bookmarkId`/`bookmarkUrlKey`） | 搜索结果节点仍不带 `iconUri`，导入书签在搜索里首帧仍是首字母 | 与本轮改动无关；首次加载成功后由 `pageDisplaySources` 兜住重挂，rev2 R8 已记录 |
| R8 | `browser-webview.css:354-357` | `.adl-filetree__item--evicted` 以更高特异性把 probe 层 `opacity` 提到 0.6 | 加载完成前 `<img>` 无内容可绘制，实测无可感知后果（rev2 R4 同结论） |
| R9 | `favicon.ts:23-24`、`BrowserFavicon.tsx:75/107` | `getFaviconUrl` 仍在渲染期触发预加载（在途已去重，纯函数性仍未满足；`preloadInFlight` 无上限、图片既不 load 也不 error 时该 URL 本会话不再预加载） | 重复代价已由 rev2 F4 消除；功能不依赖预加载（组件直接探测 http URL），在途集合有界于 distinct favicon URL 数 |

## 结论

- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）
- 摘要：rev2 的 F1 主路径已关闭（deps 门控 + `displayUrlRef` 归属，probe onLoad/onError、display onError、remember effect、URL 变化 effect 五条路径逐一核对无「旧页图标记到新 URL 名下」）；rev2 F2 已关闭（SSR 快照用例删掉 `snapshotReady` 优先级会红）。新增 2 条 low：`urlRef` 不是 probe 归属、批处理路径仍可失配且该竞态无用例（建议 `probeUrlRef` + 一条 rerender 用例）；两处注释机理描述与实现不符（含一条在退化下不会变红的冗余断言）。
