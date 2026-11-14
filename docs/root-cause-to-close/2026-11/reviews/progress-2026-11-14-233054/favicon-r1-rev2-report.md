# R1 审查报告（rev2 复审）— favicon 子系统

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`
- 快照：`.review-diffs/*-rev2.diff`（本轮 rev2，只读）；本轮清单 `.review-diffs/manifest-rev2.md`（58 文件）
- 需求/进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md` §P4（rev2 前置说明）
- 实跑命令：**无**（未运行任何测试/门禁；测试有效性全部用「读用例 + 读实现」的删除性推演）

## 范围

范围与 rev1 相同（favicon 子系统）：

| 文件 | rev2 是否变动 |
| ---- | ------------- |
| `adlo/frontend/src/app/components/BrowserFavicon.tsx` | 改（`displayUrlRef` 归属机制） |
| `adlo/frontend/src/app/components/faviconDisplayCache.ts` | 未改（rev2 diff 与 rev1 同内容） |
| `adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx` | 改（新增 SSR / 换 URL / forget / 耗尽断言） |
| `adlo/frontend/src/app/components/__tests__/faviconDisplayCache.test.ts` | 新增 |
| `adlo/frontend/src/app/features/browser-tree/browserTreeFavicon.ts` + `__tests__` | 未改 |
| `adlo/frontend/src/app/features/browser-tree/useBrowserTreeData.ts`、`types.ts` | 未改 |
| `adlo/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx`（favicon 部分） | 未改（本轮改动属树菜单事项） |
| `adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx`（favicon 部分） | 未改（本轮改动属窗口化事项） |
| `adlo/frontend/src/styles/regions/rightpanel/files-navigator.css` | 改（注释改写） |
| `adlo/frontend/src/app/utils/favicon.ts`（F4 修复落点，跨范围引用） | 改（在途去重） |

## 上轮问题关闭情况

### F1 high（页面图标记忆缺归属）— **部分关闭**

已修：`displayUrlRef`（`BrowserFavicon.tsx:124-126`）记录可见图标**归属 URL**；remember effect 改为 `rememberPageFavicon(displayUrlRef.current, displaySrc)` 且 deps 只留 `[displaySrc]`（`:251-257`），不再用渲染期 `url` 写记忆。我逐个核对了所有 `setDisplaySrc` 写点，确认「先认领归属、再改可见源」的顺序成立：URL 变化 effect（`:189-196`）、协调 effect（`:208-216`、`:223-227`、`:232-238`、`:241-244`）、耗尽（`:336-343`）、显示失败（`:354`）、probe 加载（`:308`）、complete 补检（`:368`）。URL 变化丢弃旧 probe（`:187-188`）也补上了「旧图 onLoad 落到新页」的主路径。新增用例确实能拦住 rev1 的原始 bug：`BrowserFavicon.test.tsx:306-323`（换 URL 后 `getRememberedPageFavicon('https://b.example') === ''`，删掉归属机制即变红，因为 rev1 的 remember effect 会在换页 commit 里写入 `(B, A 图标)`）。

未闭合：`:363-373` 的「complete 补检」仍用**渲染期 `url`** 直接写记忆与归属，绕过了归属校验 → 见新增 F1。这条路径还与三条新注释的绝对断言冲突（`:124-126`「绝不能被记到新 URL 名下」、`:197`「`displayUrlRef` 仍指向旧 URL，不会被误记」、`:251-252`「归属以 `displayUrlRef` 为准」）。

### F2 medium（测试拦不住回归）— **已关闭**

| rev1 要求 | 现状 | 删除性推演 |
| --------- | ---- | ---------- |
| SSR 首帧用例 | `BrowserFavicon.test.tsx:257-268` 用 `renderToString`（不执行 effect）断言首帧 HTML 含 img 与 remembered src | 把 `:107` 的 lazy 初始化改回「空初值 + effect 填值」→ SSR 输出没有 img / 没有 src，**变红** ✓ |
| 换 URL 用例 | `:306-323` | 去掉归属机制（remember 用渲染 url）→ `getRememberedPageFavicon(B)` 非空，**变红** ✓ |
| forget 用例 | `:325-336`（可见图标 error 后该页记忆为空） | 删掉 `forgetPageFavicon` 调用（`BrowserFavicon.tsx:352`）→ 断言非空，**变红** ✓ |
| failedSources 用例 | 新增 `faviconDisplayCache.test.ts:17-34`（loaded/failed 互相撤销，含内联 data-URI） | 删掉 `markFaviconSourceFailed` 的 `loadedSources.delete` / `failedSources.add` → **变红** ✓ |
| 耗尽用例断言「probe 不再挂载」 | `:369-385`（7 次失败后 `probeImg === null`，再推进 4s 仍为 null） | 删掉 `setExhaustedSrc` / probe 清理 → probe 仍挂载，**变红** ✓；且用例注释（`:378`）已如实说明「真正锁住的是 probe 不再挂载」，不再冒充「退回快照」 |

残留（不阻塞关闭，见记录 R4/R5）：「耗尽退回快照」分支本身、组件级「损坏 data-URI 重挂不再直接可见」仍无用例。

### F3 low（CSS 注释与实现不符）— **已关闭**

`files-navigator.css:300-301` 已改为「绝对定位叠在兜底首字母之上；只有加载成功（或内联快照）的来源才进入可见层」，删除了「加载期首字母始终占位」与「图片解码完成后再淡入」两处与代码（本轮已删 `transition`，无任何淡入动画）不符的绝对断言；新表述与 `BrowserFavicon.tsx:196-244`（只有 ready 来源/加载成功才进 `displaySrc`）一致。残留的绝对措辞见记录 R3。

### F4 low（渲染期预加载无在途去重）— **已关闭**

`adlo/frontend/src/app/utils/favicon.ts:23-24/37-40` 新增 `preloadInFlight`：命中 `preloadCache` 或在途均直接返回；`onerror`（`:44-46`）与 `onload`（`:47-48`）首行都 `delete`，失败不会把 URL 永久锁死。StrictMode 双调用 + `applyMetaUpdate`/URL effect 叠加只会建一个 `Image`、写一次 `persistFaviconDataUri`。渲染期仍会触发预加载（纯副作用担忧），但重复代价已消除 → 记录 R7。

## 新增发现

### F1 [severity: medium] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/BrowserFavicon.tsx:363-373`（尤其 `:368-369`）
- 描述：rev2 为了「命中浏览器缓存时补一次 complete 检查」把 `url` 加进了该 effect 的依赖，但同时用**渲染期 `url`**（而不是 probe 的归属）写 `displayUrlRef` 与页面记忆：

  ```ts
  useEffect(() => {
    const el = probeRef.current;
    if (el?.complete && el.naturalWidth > 0 && probeSrc) {
      const loaded = probeSrc;
      markFaviconSourceLoaded(el.currentSrc || loaded);
      displayUrlRef.current = url;          // ← 渲染期 url
      rememberPageFavicon(url, loaded);     // ← 渲染期 url
      setDisplaySrc(loaded);
      setProbeSrc('');
    }
  }, [probeSrc, retryKey, url]);
  ```

  换 URL 的 commit 里，`:175-199` 的 `setProbeSrc('')` 与新 probe 都只是排队更新，effect 按声明顺序执行时 `probeSrc` 仍是**上一页的 probe 源**、`probeRef.current` 仍是**上一页的 `<img>`**（key 为 `probe-${retryKey}`，换 URL 不会重挂），而这个 effect 拿到的 `url` 已经是**新页**。于是只要那张旧 probe `<img>` 在 effect 执行瞬间 `complete === true && naturalWidth > 0`（图片已下载完成、但 load 事件任务尚未派发——导航 commit 恰好发生在这个间隙），就会：① 把旧页图标记到新页名下；② 把 `displayUrlRef` 指向新页；③ `setDisplaySrc(旧页图标)` 并把新页 probe 清掉。结果与 rev1 的 F1 同类（新页显示并"记住"上一站图标），且这正好违反本轮三条新注释的绝对断言。渲染期 `url` 与 `probeSrc` 的配对，是本轮归属机制唯一没有校验的写口。
- 证据：
  - `:187-188` 注释自己声明「旧 probe 属于上一个 URL，换页后必须丢弃，避免旧图 onLoad 落到新页」，但同一 commit 内 effect 顺序（`:175-199` → `:204-249` → `:251-257` → … → `:363-373`）里，前者的 `setProbeSrc('')` 不会在后者读到之前生效，因此「丢弃」只对下一次渲染有效。
  - rev1 该 effect 的 deps 只有 `[probeSrc, retryKey]`，不会在换 URL 时触发；本轮新增 `url` 依赖后该路径才可达（`.review-diffs/...BrowserFavicon.tsx-rev2.diff` 对应 hunk）。
  - `:309` 的 `rememberPageFavicon(url, loaded)` 同理，但其闭包与该次渲染的 `probeSrc` 同源（换页后 probe 元素会被卸载，事件不会跨任务插队），风险仅限上面这条同步执行的补检。
  - 现有用例无覆盖：`BrowserFavicon.test.tsx` 里唯一的 `rerender(url=...)`（`:306-323`）发生在 probe 已加载之后（`probeSrc` 为空），补检 effect 直接短路，因此删掉这段或改回 `displayUrlRef.current` 都不会变红。
- 建议修复：给 probe 也加归属（`const probeUrlRef = useRef(url)`，在 `:248`/`:188` 设置 `probeSrc` 的同处写 `probeUrlRef.current = url`），补检要求 `probeUrlRef.current === url`，并用 `rememberPageFavicon(probeUrlRef.current, loaded)`；或把 `url` 从 deps 去掉、只按 `probeSrc`/`retryKey` 触发（换页由 URL effect 负责）。补一条用例：先让 probe 处于「已加载但未派发 load」状态（`Object.defineProperty(probeImg, 'complete'/'naturalWidth'`），`rerender` 到无元数据的新 URL，断言 `getRememberedPageFavicon(新 URL) === ''` 且可见图标不是旧页图标。另可补「新页 meta 未就绪 → 过渡期保留旧图标但不写记忆」的用例（目前该分支（`:232-238` 之外）无用例）。

### F2 [severity: low] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/BrowserFavicon.tsx:78`、`:86-88`；用例 `.../__tests__/BrowserFavicon.test.tsx:257-268`、`:338-350`
- 描述：rev2 的 SSR 用例只覆盖了「记住的 src」这一条首帧路径，**书签快照（`snapshot`）首帧**仍没有能失效的回归保护。删掉 `resolveInitialSources` 里 `snapshotReady ? snapshot : ''` 的优先级（让 `display` 只在 effect 里由 `snapshot` 填），`BrowserFavicon.test.tsx:338-350` 仍会通过——RTL 的 `render()` 在返回前 flush 完 effect，`displaySrc` 已被协调 effect 填成快照；SSR 用例没传 `snapshot`，也不受影响。而「导入书签快照首帧直接显示」正是用户 2026-11-15 反馈的主场景（P3 第三轮靠浏览器采样验证，未落成可失效的自动断言）。
- 证据：`:338-350` 断言的是 `render()` 之后的 DOM（effect 已跑）；`:257-268` 的 `renderToString` 场景没有 `snapshot` prop；组件内快照的首帧来源只有 `:78/86-88`。
- 建议修复：在 SSR 用例里加一条无 remembered、仅 `snapshot="data:image/png;base64,SS"` 的断言（`toContain('data:image/png;base64,SS')`），即可锁住 `resolveInitialSources` 的快照分支。

## 记录不修

| # | 位置 | 内容 | 不修理由 |
| - | ---- | ---- | -------- |
| R1 | `BrowserFavicon.tsx:219-222` | `preferred === displaySrc` 早退时不写 `displayUrlRef`：同源导航（`getFaviconUrl` 按 origin canonical，前后页 src 相同）时归属停留在旧 URL | 后果仅是新 URL 少一次记忆写入（图标本身正确）；随后若该图标 error，`forgetPageFavicon(旧URL, src)` 的误伤也无意义（`markFaviconSourceFailed` 已全局撤销该 src 的就绪性） |
| R2 | `BrowserFavicon.tsx:253-257` vs `:309`/`:369` | 记忆写入三处（effect + probe onLoad + complete 补检）重复 | 同键同值幂等；保留事件处写入是为了「本帧即生效」，effect 负责兜底 |
| R3 | `files-navigator.css:300-301` | 「因此不会出现「首字母 → 图片 → 首字母」的图层闪烁」仍是绝对断言；构造性反例存在（父级把已显示的 `snapshot` 换成损坏 data-URI → error → 回退首字母） | 该断言描述的是层叠设计意图且主路径成立；反例需跨 prop 变更，措辞收紧即可，不阻塞 |
| R4 | `BrowserFavicon.tsx:336-343` | 耗尽分支「退回快照」（`owner === url` 的 else-if）仍无用例；rev1 F2 该条以注释澄清替代了用例 | 该分支只在「旧来源已显示成功、随后换了新来源且 6 次失败」时可达，现网难构造；注释已如实标注真正被锁住的是「probe 不再挂载」 |
| R5 | `faviconDisplayCache.test.ts:26-34` | `failedSources` 只有模块级用例；缺「同一损坏 data-URI 在**第二次挂载**时不再直接可见」的组件级回归 | 模块语义已被锁，组件侧 `isFaviconSourceReady` 的调用点（`:77-88`）稳定；低价值重复覆盖 |
| R6 | `BrowserFavicon.tsx:232-249` | 导航到「有 favicon URL 但本会话已失败/长期不可达」的页面时，上一站图标会保留到 6×2s 重试耗尽（约 12s）才清空 | 「过渡期保留旧图标」是用户要的无中间态；代价是罕见场景下 12s 错图标窗口。后续可把「命中 `failedSources`」视为无图标直接收尾，属策略调整而非缺陷 |
| R7 | `favicon.ts:23-24`、`BrowserFavicon.tsx:75/107` | `preloadInFlight` 无上限；图片既不 load 也不 error 时该 URL 本会话不再预加载；`getFaviconUrl` 仍在渲染期触发预加载（纯函数性仍未满足） | 在途集合有界于 distinct favicon URL 数量；预加载缺失时组件仍直接探测 http URL，功能不降级；重复代价已消除 |
| R8 | rev1 记录项 | `resolveInitialSources` 的 `preferred`/`!initial.meta` 冗余（`:76`、`:117`、`:181`）、`faviconUrl`+`faviconUrlRef` 双份状态、搜索行不带 `iconUri`（`BrowserNavSearchMode.tsx:90-104`）、`.adl-filetree__item--evicted` 覆盖 probe 透明度（`browser-webview.css:354-357`） | 与 rev1 判断一致，本轮未触碰；均为无行为影响或已被用户路径覆盖的项 |

## 结论

- 需修复项：2（critical 0 / high 0 / medium 1 / low 1）
- 摘要：rev1 的 F1/F2/F3/F4 四条中，F2/F3/F4 已关闭且回归保护经删除性推演有效；F1 的主路径（remember 按归属写、URL 变化/失败/耗尽清旧页图标）已修好，唯一漏口是「complete 补检」用渲染期 `url` 配对上一帧 `probeSrc`（新增 F1，medium，窄窗口竞态，建议一条 `probeUrlRef` 守卫 + 用例）；另外快照首帧路径仍缺可失效断言（新增 F2，low）。
