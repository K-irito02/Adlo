# browser-copy — R2 / rev5 报告（清理向只读审查）

## 范围

- rev：5（R2 清理审查），scope：`browser-copy`
- 快照：`.review-diffs/manifest-rev5.md` + 4 个 `*-rev5.diff`（只看本轮；未跑 git diff/log/show）
- 文件（owner）：
  - `adlo/frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx`
  - `adlo/frontend/src/app/features/browser/browser-landing/BrowserLandingPage.test.tsx`
  - `adlo/frontend/src/app/i18n/zh-CN/browser.ts`
  - `adlo/frontend/src/app/i18n/en-US/browser.ts`
- 旁证（只读）：`i18n/copyToClipboard.ts`、`utils/clipboard.ts`、`i18n/types.ts`、`i18n/index.ts`、`tauri-bridge/tauri-shared.ts`、`features/dsh/dshAuthUrl.ts`、`stores/actions/dshActions.ts`、`stores/slices/browserTypes.ts`、`components/ContextMenu` 用法。
- R2 核查类别：死代码 / 冗余守卫 / 根因修后多余的防御 / 应删或降级的诊断日志。
- **只读**：未跑测试套件、未跑 `check:*`、未起 dev server、未占用端口、未改源码。

### 快照同一性（本轮判断的前提）

四份 rev5 快照与 rev2 字节数完全一致（5380 / 7544 / 727 / 719），即 rev3–rev5 未再改动本 scope；当前源码行号与 R1/rev2 报告引用逐条对得上。因此本轮不重复 R1 已关闭的 F1–F3，只做清理向复核。

### R2 专项核查结论（无主表 finding）

| R2 检查项 | 结论 |
| --- | --- |
| 诊断日志 | 四个文件内 `console.*` / `debugger` / `TODO` / `FIXME` 均为 0（`grep` 已核）。R1 F2 删除 `try/catch` 时未遗留日志调用。 |
| 死代码 | 新增代码无不可达分支：`!result.ok`、`processError`、`pids.length === 0`、`!copied.ok` 四条分支各有独立语义，且前两条/第三条各有用例锁定。仅发现预存死 `catch`（见「记录不修」#1，不在本轮 diff）。 |
| 冗余守卫 | `handleCopyShortcutLink` / `handleCopyPortLink` / `handleCopyPortPid` 里的 `if (!site)` / `if (!port)` **不是可删的冗余守卫**：`shortcutMenu.site` / `portMenu.port` 的类型是 `ShortcutSite \| null` / `LocalPort \| null`（`BrowserLandingPage.tsx:58-70`），删掉后 `site.url` / `port.host` 无法通过类型检查；且同文件既有处理器（`:184`、`:191`、`:262`、`:278`、`:293`）同为「先判空再动作」形状，保持一致。 |
| 根因修后多余的防御 | `if (authed && 'canceled' in authed)`（`:127`）的 `authed &&` 不能删——`'in'` 作用于 `null` 会抛；`DshAuthResolution = DshAuthUrl \| {canceled:true} \| null`（`dshAuthUrl.ts:22`）证明 null 可达。两处 `dismissDshRecoveryToast()`（`:132`、`:136`）不是冗余：`ensureDshUrl` 只在失败/取消路径内部收起，成功且 `url:null` 时仍会留下常驻 toast；取消路径在 `dshActions.ts:227/232` 内部已收起，故 `:127-129` 直接 return 不泄漏。 |
| 无用 i18n 键 | 本轮新增 4 键全部有调用点（`browserContextCopyPid`:390、`browserCopyPidUnavailable`:246、`browserCopyPidNotFound`:251、`browserCopyFailed`:210/225/256）；zh/en 两套键名与文案逐条一致；`CopyDict` 由 `keyof typeof zhCN` 派生（`types.ts:4`），无第二处键清单需要同步。 |

## 上轮问题关闭情况（逐条）

- **F1 [low/正确性] 失败/无权限与「无进程」混用文案 → 仍为已关闭**。`BrowserLandingPage.tsx:245-253` 保持 rev2 判定：`!result.ok || result.data.processError` → `browserCopyPidUnavailable`；仅 `pids.length === 0` → `browserCopyPidNotFound`。用例 `test.tsx:160-187` 两条仍分别断言两套文案并断言 `writeText` 未调用；删除性推演仍成立（把 `:245` 折回「失败当空数组」两条即变红）。
- **F2 [low/副作用] 剪贴板失败无反馈 + 死 catch → 仍为已关闭**。三个入口（`:209-211`、`:224-226`、`:255-257`）都检查 `ok`；`handleCopyPortPid` 内无 `try/catch` 残留，也无不可达代码。`copyToClipboard`（`i18n/copyToClipboard.ts:4-12`）内部 catch 且返回结构化结果，toast 是唯一可感知路径。
- **F3 [low/测试] 测试缺口（多 PID / 查询失败）→ 仍为已关闭**。`test.tsx:128-145`（`'4321\n8765'`）、`:160-171`（`ok:false`）、`:173-187`（`processError`）、`:189-197`（剪贴板拒绝）四条仍在，标题与断言一致；其余 4 条仍从公共入口（渲染 → 真实 `ContextMenu` → 点 menuitem）进入。
- 本轮未发现修复引入的回归或契约错误；R1 判定「零问题」在 rev5 快照上仍成立。

## 新增发现

无。（主表为空：本轮没有需要修复的死代码、冗余守卫、多余防御或诊断日志。）

以下为 R2 复核中排除的候选，供主代理确认口径：

- `BrowserLandingPage.tsx:321-331` 的 `catch` 可证明不可达（见「记录不修」#1），但属预存代码且不移除也不改变行为 → 不进主表。
- `invokeIpc` 返回判别联合，`!result.ok || result.data.processError` 的短路顺序正确：`ok:false` 时不会读取 `data`（`test.tsx:162` 的 mock 无 `data` 字段，用例通过即证）。
- 端口复制链接用 `http://${host}:${port}` 拼接（`:223`）与 `:193`、`LocalPortSection.tsx:150` 同形，已在 R1 记为预存重复；本轮未新增第四处（PID 路径只传裸端口号）。

## 记录不修

- **#1 预存死 `catch`（死代码，建议顺手清）**：`BrowserLandingPage.tsx:298-331` 中 `try` 体内只有 `invokeIpc`（`tauri-shared.ts:6-26` 已 catch 全部异常并返回 `{ok:false}`）与两个 `setState`，`catch` 分支（`:321-331`）不可达，且与 `else` 分支（`:310-320`）逐字段重复。R1 F2 已按同一理由删除 `handleCopyPortPid` 的 `try/catch`，此处是同一根因下的残留。预存（不在 rev5 diff）、零行为影响 → 按复审收敛规则不计入主表；若要收口，改为 `if (result.ok) {...} else {...}` 并删除 catch。
- **#2 整模块死代码（预存，跨文件）**：`adlo/frontend/src/app/utils/clipboard.ts`（25 行，与 `i18n/copyToClipboard.ts` 逐字相同）在 `adlo/` 内无任何导入点（`grep 'utils/clipboard'` = 0）；同时 `copyMultiple` 两份实现均无消费方（`grep copyMultiple` 只命中定义与 `i18n/index.ts` 的 re-export）。不在本 scope 文件内，建议主代理单列清理项。
- **#3 浏览器模式无法复制 PID**（预存能力差异）：`browser_get_port_details` 在浏览器模式拿不到进程信息；F1 修复后提示已从「未找到」变为「无法获取」，不再误导。彻底对齐属 mock-bridge 后续工作。
- **#4 测试夹具 `as unknown as CopyDict`**（预存）：仅构造部分字典供子组件渲染，未用于调私有方法/读内部字段；`check-no-new-any` 覆盖范围不含该测试文件。
- **#5 端口 URL 拼接三处重复**（预存）：`LocalPortSection.tsx:150`、`BrowserLandingPage.tsx:193`、`:223`；可提取 `portUrl(host, port)`。
- **#6 三处复制失败分支同形重复**：`:209-211` / `:224-226` / `:255-257` 各 3 行，语义各异（PID 路径需先查询），提取收益低于抽象成本。
- **#7 剪贴板失败 toast 用 `warning`**：既有同类失败（`FirstRunProvisioningWizard.tsx:767`）用 `error`；仓库无书面规约，`showToast` 默认级别即 `warning`，可感知，属风格差异。
- **#8 剪贴板失败仅一处有回归用例**：只有「快捷站点复制链接」路径有 `writeText` 拒绝用例（`test.tsx:189-197`）；删除 `:224`（端口链接）或 `:255`（PID）的 `ok` 检查不会变红。同一 helper 语义的重复内联，风险低，未计为需修复。
- **#9 测试默认 mock 形状与契约不符**：`test.tsx:81` 的 `invokeIpc.mockResolvedValue({ ok: true, data: [] })` 与 `PortDetails` 形状不一致，且无用例依赖（PID 用例都自带 mock）；若将来有测试点「复制PID」而未覆盖 mock，会在 async IIFE 内抛未处理 rejection。建议改为 `{ ok: true, data: { processes: [], processError: null } }`。
- **#10 `afterEach` 与 `beforeEach` 重复重置**：`test.tsx:89-91` 与 `:82-87` 重置同一批 store 字段，严格冗余（无隔离作用，RTL 每例重新 render）。
- **#11 `PortDetails` 结构字面量三处重复**：`:79-86`（state）、`:241-244`（本轮新增的最小子集）、`:299-306`（详情查询）；仓内无共享导出类型可复用（`grep PortDetails` 仅 i18n 文案与本地用法）。
- **#12 `copyToClipboard` 三种导入路径**：`@i18n` barrel（本文件 `:2`）、`../i18n`（`ToastCard.tsx:3`）、`../../i18n/copyToClipboard`（`AgentSiteRulesPanel.tsx:12`）；预存风格。
- **#13 新增 i18n 键插在 `browserContext*` 组内**：`browserCopyPid*` / `browserCopyFailed` 语义不属 context-menu 前缀组；纯风格（R1 已记）。
- **#14 `ContextMenu` 双次 `onClose` 幂等**（已知记录）：点击菜单项时 `action()` 与 `onClose` 都会收菜单，处理器内已先 `handleContextMenuClose()`，重复调用无副作用。

## 结论

- 上轮 F1/F2/F3 全部仍关闭；rev5 未引入回归、契约错误、死代码或多余防御。
- 队列中 R2 清理建议（记录不修 #1 死 `catch`、#2 孤儿 `utils/clipboard.ts`）均属预存、零行为影响，不影响本轮零问题判定。
- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题
