# R1 审查报告（rev5 复审）— favicon 子系统

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`
- 快照：`.review-diffs/*-rev5.diff`（本轮 rev5，只读）；清单 `.review-diffs/manifest-rev5.md`（66 文件）
- 需求/进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md`（`R1 rev4` 段）
- 上一轮报告：`.review-diffs/favicon-r1-rev4-report.md`
- 实跑命令：**无**（未运行任何测试/门禁；测试有效性全部用「读用例 + 读实现」的删除性推演）

## 范围

rev5 相对 rev4 在 favicon 范围内**只改 1 个文件**（其余 favicon 相关文件 rev4/rev5 快照哈希逐一比对一致）：

| 文件 | rev5 变动 |
| ---- | --------- |
| `adlo/frontend/src/app/components/BrowserFavicon.tsx` | 改：`probeSrc`（string state）+ `probeUrlRef`（effect 期改写的 ref）→ 单一 `probe: { src, ownerUrl }` state；`handleProbeLoad` / `handleProbeError` / complete 补检改为读同一次提交的 `probeSrc` + `probeOwnerUrl`；删除 `probeUrlRef` 与 `\|\| url` 兜底；`handleProbeError` 增加 `probeOwnerUrl === url` 守卫；注释同步 |

未改（哈希与 rev4 一致，结论沿用上一轮）：`__tests__/BrowserFavicon.test.tsx`（**本轮没有新增用例**）、`faviconDisplayCache.ts` 及其用例、`browserTreeFavicon.ts` 及其用例、`types.ts`、`useBrowserTreeData.ts`、`BrowserEntrySubEntries.tsx`、`BrowserTreeEntryFlatList.tsx`、`browserTreeEntryUtils.tsx`、`utils/favicon.ts`、`utils/browserDisplayUtils.ts`、`files-navigator.css`（probe 层样式）、`BrowserTabBar.tsx`、`CenterTabStrip.tsx`、`CenterBrowserView.tsx`。

范围外但与之交互（属 bookmark-star 审查范围，favicon 无行为变化）：`BrowserNavSearchMode.tsx` 本轮改为按搜索结果自身 `source` 判定归属 + 标题匹配未使用条目；书签行 `nodeType` 仍为 `'bookmark'`（被动判定成立），仍未透传 `iconUri`（见记录不修 R7）。

## rev4 问题关闭情况

### rev4 F1 low（归属 ref 与已提交 probe state 存在一帧调度间隙）— **已关闭**

逐项核对（行号为当前工作区源码）：

1. **已改为单一 state `{src, ownerUrl}`**：`:112-120` `const [probe, setProbe] = useState(() => ({ src: initial.probe, ownerUrl: initial.probe ? url : '' }))`，并派生出 `probeSrc` / `probeOwnerUrl`。归属不再存在于任何 effect 改写的 ref 里，渲染闭包里的 `src` 与 `ownerUrl` 必然来自同一次提交 ✓
2. **`setProbe` 调用点全部传对象，无遗漏**（共 10 处）：URL/snapshot 变化清空 `:195`；协调 effect 的 5 个分支 `:214`（无候选）、`:227`（`preferred === displaySrc`）、`:231`（就绪）、`:252`（耗尽）、`:255`（`{ src: preferred, ownerUrl: url }` 成对写入）；`handleProbeLoad` 成功 `:322`；`handleProbeError` 耗尽 `:357`；`handleDisplayError` 重探 `:371`（`{ src: preferredSrc, ownerUrl: url }`）；complete 补检 `:389`。`grep` 全仓 `setProbeSrc` / `probeUrlRef` / `urlRef` 在 `adlo/frontend/src` **已无任何残留**（仅进度文件的历史条目提到旧名）✓
3. **`handleProbeLoad`（`:309-324`）**：`loaded = probeSrc`、`ownerUrl = probeOwnerUrl`，二者同一次提交；`ownerUrl` 为空时**早退**（不再回落到渲染期 `url`）✓
4. **complete 补检（`:375-391`）**：deps `[probeSrc, probeOwnerUrl, retryKey]`，归属只取 `probeOwnerUrl`，为空早退；`el` 与 `probeSrc` 来自同一渲染（probe `<img>` 的 `src` 就是 `probeSrc`，`:424-436`）✓
5. **`handleProbeError`（`:326-358`）**：失败源用 `probeSrc`；`:347` 新增 `probeOwnerUrl === url` 守卫——旧页 probe 失败时不再用渲染期 `url`/本页 `snapshot` 改可见层，方向安全 ✓
6. **`|| url` 兜底已删除**：`:314-317`、`:381-384` 均为「归属为空即早退」，不再存在把渲染期 `url` 当 probe 归属的路径 ✓
7. **「旧 probe 归属新页」路径已闭合**：换页 commit 里 DOM 上仍是旧 probe（`probeSrc` state 未变）时，闭包归属同样是旧页 → load/error 都按旧页记账；下一次提交起 probe state 与新页成对更新（URL effect `:195` 先清、协调 effect `:255` 再按新 `url` 成对写入，同批按顺序后者生效）。rev4 报告指出的「ref 先被 effect 改写、DOM 仍是旧 probe」的间隙不再产生错配 ✓
8. **不可测性**：仍无公共 API 可达的用例（换页 `rerender` 在 `act` 内先卸载旧 probe；脱离文档的节点事件不冒泡到 React 19 根监听器），本轮**未新增用例**符合预期，按「结构修复 + 注释」关闭 ✓

## 新增发现

**无**（本轮改动只收敛归属表征，未发现 critical/high/medium/low 级新增问题）。

已专门核对、判定不成立的点：

- **新 state 是否引入渲染循环**：协调 effect 的 deps 仍为 `[preferredSrc, displaySrc, exhaustedSrc, snapshot, rememberedSrc, url]`（`:256`），**不含 `probe`**，而 effect 体不读 `probe` → `setProbe` 对象身份变化不会回灌该 effect；complete 补检与 `handleProbe*` 的 deps 均为原始值（`probeSrc`/`probeOwnerUrl`），对象身份变化也不会重跑 ✓
- **依赖完整性**：`handleProbeLoad` 只依赖 `probeSrc`/`probeOwnerUrl`（不再有 `url`）；`handleProbeError` 依赖 `probeSrc`/`probeOwnerUrl`/`clearRetryTimer`/`snapshot`/`url`；`handleDisplayError` 依赖 `displaySrc`/`preferredSrc`/`url`；complete 补检含 `retryKey`。逐项与函数体用到的值一致，无缺项/多项 ✓
- **`ownerUrl` 为空的不变式**：`url === ''` 时协调 effect 仍可能写入 `{ src: snapshot, ownerUrl: '' }`，但该分支渲染早退（`:395-401` 返回新标签页图标，probe `<img>` 不挂载），且两个事件处理与 complete 补检都有「归属为空早退」→ 不会把图标记到空页面名下 ✓
- **`displayUrlRef`（可见层归属）未回归**：所有 `setDisplaySrc` 写入点（`:198-199`、`:201-202`、`:217-218`、`:221-222`、`:232-233`、`:240-241`、`:243-244`、`:249-250`、`:319-320`、`:349-352`/`:353-355`、`:367-368`、`:386-388`）都在同一语句块内先认领归属，或该处 `displayUrlRef.current === url` 已成立；remember effect（`:258-264`）只在 `displaySrc` 变化的提交执行，归属不会滞后 ✓
- **注释与实现相符**（简报 §5.8 绝对措辞）：`:112-114`「保证渲染闭包看到的 src 与 ownerUrl 永远来自同一次提交」——由单一 state 派生，成立；`:380`「归属与 src 同属一个 state，保证是这次 probe 自己的页面」——成立；`:134-136` 关于 `exhaustedSrc`「换源/重挂后自动失效」——URL effect `:191` 确会重置 ✓
- **镜像侧行为**：`browserTreeFavicon.ts` 的 `snapshot` 透传未被回退，`BrowserTreeEntryFlatList` 窗口化（80 行）与重挂不闪烁链路仍成立 ✓

## 记录不修

| # | 位置 | 内容 | 不修理由 |
| - | ---- | ---- | -------- |
| R1 | `BrowserFavicon.tsx:226-229` | `preferred === displaySrc` 早退不认领 `displayUrlRef`（同源导航且两页 favicon URL 相同时归属停留旧 URL） | 图标正确；后果仅新 URL 少一次记忆写入，且后续任一 `setDisplaySrc` 都会先认领归属（rev2–rev4 同结论） |
| R2 | `BrowserFavicon.tsx:258-264` vs `:320` | 页面记忆写入两处（remember effect + `handleProbeLoad`） | 同键同值幂等；事件处写入让「本帧即生效」，effect 兜底 |
| R3 | `BrowserFavicon.tsx:246-254`、用例 `BrowserFavicon.test.tsx:367-404` | 耗尽分支「退回快照」仍无真正锁住它的断言（快照本来就已可见） | 用例注释已如实说明「真正锁住的是 probe 不再挂载」；该分支只在「旧来源已成功显示 → 换新来源 → 7 次失败」时可达 |
| R4 | `__tests__/faviconDisplayCache.test.ts:26-34` | 损坏内联 data-URI 缺组件级「第二次挂载不再直接可见」回归 | 模块语义已锁，调用点稳定 |
| R5 | `BrowserFavicon.tsx:237-255` | 导航到「本会话已失败/长期不可达」的 favicon 时，上一站图标保留到 6×2s 耗尽（约 12s） | 「过渡期保留旧图标」是用户要的无中间态；命中 `failedSources` 直接收尾属策略调整 |
| R6 | `BrowserFavicon.tsx:76`、`:89-94`、`:186` | `resolveInitialSources` 的 `preferred` 冗余、`meta !== display` / `snapshot !== display` 与前面分支互斥冗余 | 纯冗余，无行为影响 |
| R7 | `BrowserNavSearchMode.tsx:129-145`（`node` 构造处无 `iconUri`） | 搜索结果节点仍不带 `iconUri`，导入书签的 `snapshot` 到不了搜索行，首帧仍露首字母 | 本轮改动属归属/菜单裁剪范围；`faviconPropsForNode` 已能透传，后续统一接一个字段 |
| R8 | `browser-webview.css:354-357` | `.adl-filetree__item--evicted` 以更高特异性把 probe 层 `opacity` 提到 0.6 | 加载完成前 `<img>` 无内容可绘制，无可感知后果 |
| R9 | `favicon.ts:23-24`、`BrowserFavicon.tsx:75/80/140` | 渲染期读镜像/页面记忆（`getFaviconUrl` 触发预加载） | 渲染期同步读缓存正是「重挂不闪」的前提；重复代价已由在途去重消除 |
| R10 | `BrowserFavicon.tsx:208` | 孤立注释「说明：snapshot 变化时同样需要重置重试/耗尽状态」放在 effect 之外（空行隔开） | 内容准确（`snapshot` 确在 `:206` deps 内），纯排版问题 |
| R11 | `browserTreeFavicon.ts:26` | `node.iconUri` 未经 `data:image/` 校验即作为 `snapshot`（导入的 `ICON` 可能是 http URL） | 非内联来源不会被判为就绪，只进 probe 层按真实加载结果决定；`<img src>` 不执行脚本 |
| R12 | `BrowserFavicon.tsx:195/214/227/231/252/322/357/371/389` | `setProbe` 每次都传新对象字面量，取值相同也会触发一次额外渲染（协调 effect 每个触发周期最多多一帧） | 无循环（deps 不含 `probe`），最坏是一次空渲染；如需消除可用 `setProbe((prev) => …)` 返回原对象。纯优化 |
| R13 | `BrowserFavicon.tsx:346-357` | 旧页 probe 耗尽失败时仍 `setExhaustedSrc(旧页 src)` 并清掉当前页 probe | 自愈：URL 变化先重置 `exhaustedSrc`（`:191`），该次写入构成 dep 变化 → 协调 effect 立即按新页 `preferred` 重建 probe；`markFaviconSourceFailed` 是全局语义、方向正确。若能收到 `probeOwnerUrl !== url` 即 return 可更干净，属收窄优化 |

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）—— **本轮零问题**
- rev4 的 1 条 low **已关闭**：`probe` 已收敛为 `{src, ownerUrl}` 单一 state，10 个 `setProbe` 调用点全部传对象，`handleProbeLoad` / `handleProbeError` / complete 补检一律读同一次提交的归属且归属为空即早退，`probeUrlRef`、`setProbeSrc`、`|| url` 兜底均已删除，不存在「旧 probe 归属新页」的剩余路径。
- 新 state/依赖专项核对通过：协调 effect 的 deps 不含 `probe`（无渲染循环）、各回调 deps 与函数体一致、`url === ''` 与 `displayUrlRef` 归属链均安全；`BrowserFavicon.test.tsx` 本轮未改（该竞态仍无公共 API 可达用例，符合「结构修复 + 注释」的既定语）。
- 记录不修新增 2 条纯优化项（`setProbe` 对象身份多一帧空渲染 R12；旧页 probe 耗尽的收窄写法 R13），不改变行为。
