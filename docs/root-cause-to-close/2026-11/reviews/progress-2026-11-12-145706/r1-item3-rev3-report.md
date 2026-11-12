# R1 终审报告 — 事项 3（rev3）

- 仓库：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 快照：`.review-diffs/*-rev3.diff`（base `3f7a4a8ecb71656a38aee09acd878c9dbfb0901b`，3 commits，89 files）
- 需求真源：`docs/root-cause-to-close/2026-11/progress-2026-11-12-145706.md` 事项 3 / 3b
- 规约：根 `AGENTS.md`、`adlo/AGENTS.md`、`.agents/rules/review-judgements.md`、`mandatory-testing.md`、`dev-rules.md`、`hint-color-usage.md`
- 只读复核：未运行 git、未修改源码；仅写本报告。仅用 rev3 快照 + 工作区源码。

## 范围

- `adlo/crates/browser/src/init_script.js`（规则匹配 / 属性提取 / 3b 去重 / `isAbsoluteLocalPath`）
- `adlo/crates/browser/src/{browser_events,browser_navigation,browser_webview}.rs`（`file:` 放行、规则序列化注入）
- `adlo/crates/kernel/src/{config,config_watcher,app_info}.rs`；`adlo/crates/types/src/types/{config,mod}.rs`（配置模型 / patch / 归一化 / 默认解析）
- `adlo/crates/server/src/handlers/workspace.rs`、`router.rs`、`tests/workspace_all.rs`（`POST /workspace/add`）
- `adlo/src-tauri/src/commands/{browser,browser_webview_setup,divider_strip}.rs`、`tauri.conf.json`
- `adlo/frontend/src/app/App.tsx`、`features/browser/useBrowserAgentLinkSubscription.ts` + test、`features/preview/openByMethod.ts` + test
- `.../settings/AgentSiteRulesControl.tsx` + test、`SettingsControls.tsx`、`settingsGroups.ts` + test、`settingsSearchAnchors.test.tsx`、`SettingsPanel.test.tsx`
- `app/utils/settingsViewModel.ts` + test；`shared/{agentSiteRules,defaultPreferences,ipc-types.generated,preferencesMerger,localFilePath}.ts`、`shared/ipc/{browser,workspace}.ts`
- `tauri-bridge/tauri-browser.ts`、`httpBridge.ts`、`mock/*`、`preview-bridge/preview-workspace.ts`；`i18n/{zh-CN,en-US}/{settings,browser}.ts`；`styles/components/settings.css`

## 上轮问题关闭情况

| 上轮 | 结论 | 依据 |
| ---- | ---- | ---- |
| N1 medium 配置生效链路零测试 / Rust reset 变体 | **基本关闭（① 未真正关闭，见新发现）** | JS：`initScriptNavigation.test.ts:278-285` 新增 `setAgentRules`，`beforeEach` 清理两个注入全局；新增 regex（:412）、`disabledRuleIds`（:429）、站点 `siteRules`（:450）、非法属性名（:475）、空属性列表（:491）五条用例。Rust：`config.rs:320-367` 补单站点 reset（删 a 留 b、再删 b 归 `None`）、`Some([])` 语义、reset+set 同发优先级；三条均能在删掉对应分支后变红。**但 regex 用例不能区分 regex 分支，见 N1。** |
| N2 medium 逗号用例假绿 | **已关闭** | `AgentSiteRulesControl.test.tsx:57-71` 改为先 `fireEvent.change(attrs,'title,')` 并断言**显示值** `toBe('title,')`，再输入第二段后保存。旧 effect 依赖 `[rules, selectedId]` 会在 change 后回写 `join(', ')` = `'title'`，该断言必红。 |
| N3 medium 空属性列表回落 `title` | **已关闭** | `init_script.js:132-133` 改为 `Array.isArray(...)` 后 `if (!attrs.length) continue;`；`initScriptNavigation.test.ts:491-505` 用 `attributes: []` + `title=E:\ws\a.md` 断言 0 条 agent-link（旧实现回落 `title` 必红）。TS `agentSiteRules.ts:68-86`、Rust `config.rs:131-147` 仍保留空数组，三处语义一致（空 = 不匹配）。 |
| N4 low 注释 / `pub(crate)` | **已关闭（ui-manual 行按 P5 记录）** | ①`types/config.rs:24-34` 改为「file://, drive letters, UNC」并说明前导 `/` 为站点相对；②`shared/ipc/browser.ts:45` 改为「调用方必须传已解析规则；缺省不注入规则 → 不拦截」，与 `browser.rs:32-33` 的 `unwrap_or_default()`（空规则集 → JS 不拦截）行为一致；③`shared/ipc/workspace.ts:100` 改为 `@command POST /workspace/add (adl-server HTTP; no Tauri invoke)`；④`kernel/config.rs:246,268,276` 已降为 `pub(crate)`，全仓仅 `app_info.rs:53-54`（同 crate）消费；⑤ui-manual 行仍未补，已在进度文件 P5 台账登记。 |
| N5 low 站点空态复用全局文案 | **已关闭** | `AgentSiteRulesControl.tsx:55-67,303` 新增必填 `emptyHint`；全局弹窗传 `settingsAgentRulesEmptyGlobal`（:524），站点弹窗传 `settingsAgentRulesEmptySite`（:594）。新 key 中英各一条（`zh-CN/settings.ts:38`「暂无站点规则」/ `en-US/settings.ts:38`「No site rules」）。 |
| N6 low UNC 主机丢失 | **已关闭** | `useBrowserAgentLinkSubscription.ts:21-25`：`url.host` 非空时还原 `\\host\share\...`；`useBrowserAgentLinkSubscription.test.ts:37-39` 断言 `file://server/share/a.md → \\server\share\a.md`（旧实现返回 `/share/a.md`，必红）。 |

**记录不修项复核**：ui-manual 行（P5，进度文件 :89）、预览 dev 服务无 `/workspace/add`（桌面端能力，预览桥显式降级）、CSS 未跑 `ui-probe.mjs`（用户已在桌面 WebView 目视验收）三项理由仍成立，未发现新的反证。

## 新增发现

### N1 [severity: medium] [category: 测试有效性]

- 位置：`adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts:412-427`（regex 用例）；`adlo/crates/browser/src/init_script.js:106-119`（regex 分支）
- 描述：rev2 N1 要求的「`regex` preset 命中 / 不命中」仍未获得有效保护。新用例的命中值 `E:\ws\a.md` **同时满足 `fileLike`**，因此删掉 `__adlRuleValueMatches` 的 `pathPreset === 'regex'` 分支（或让它恒走 `isAbsoluteLocalPath`）后用例仍为绿；「不命中」用例完全缺失。进度文件 P4 rev2（:126）把「regex」写成已补覆盖，属名义覆盖。
- 证据：
  1. `init_script.js:118` 的 `fileLike` 判定 `isAbsoluteLocalPath('E:\ws\a.md')` 为真（`/^[A-Za-z]:[\\/]/`）。
  2. 用例只断言「命中」且断言值与 fileLike 命中结果逐字相同；删掉 `:108-115` 后仍返回 `{kind:'file', url:'E:\ws\a.md'}`。
  3. 全仓 `pathPreset: 'regex'` 仅出现在该文件 `:420`、`:438` 与归一化用例，`valueRegex` 从未用于「只有 regex 能命中 / regex 不命中」的值。
- 建议修复：把命中值换成 fileLike 不认的值，例如 `valueRegex: '^https://files\\.example/'` + `data-path: 'https://files.example/a.md'`；并补一条反证：同一规则下 `data-path: 'E:\ws\a.md'`（regex 不匹配、fileLike 会匹配）断言 0 条 agent-link —— 该用例在「忽略 regex 分支」时必红。可顺带覆盖 `regexFlags: 'i'`。

> 说明（不计入需修复）：`initScriptNavigation.test.ts:475-489` 的非法属性名用例无法触达 `init_script.js:136-142` 的 `catch` —— jsdom 的 `getAttribute('data file')` 返回 `null` 而不抛错（实测 `node -e` + jsdom：`getAttribute` → `null`，`setAttribute` 才抛 `InvalidCharacterError`）。该用例仍能防止「非法名回落 title」，属可接受的环境限制；若要覆盖 `catch` 需 stub `Element.prototype.getAttribute` 抛错。

## 记录不修

- `useBrowserAgentLinkSubscription.ts:23-25`：`file://localhost/C:/x` 会还原成 `\\localhost\C:\x`；`toLocalFileUrl` 从不产出该形态，属外部输入的极端边角。
- `shared/ipc/browser.ts:45`「缺省不注入规则」：Rust 实际注入 `[]`（`unwrap_or_default()`）而非跳过注入；行为结论（不拦截）正确，仅措辞精度问题。
- `initScriptNavigation.test.ts:475-489` 未覆盖 `getAttribute` 抛错分支（jsdom 不抛，见上）。
- `preview-workspace.ts` 的 `updateRecentWorkspaces` 后重复 persist（rev2 已记录，幂等）。
- `/workspace/add` 复用 `upsert_sidebar_after_open` 会刷新未激活工作区的 `lastOpenedAt`（rev1 已记录，字段不参与排序）。
- 站点自定义规则无法覆盖同元素全局规则（`global.concat(siteRules)` 取首个命中，UI 提供停用开关；rev1 已记录）。
- ui-manual 新设置项行（P5 台账）；预览 dev 服务无 `/workspace/add`（桌面端专属）；CSS 未跑 `ui-probe.mjs`（用户目视验收）。

## 结论

- 需修复项：1（critical 0 / high 0 / medium 1 / low 0）

### 判断项核对（review-judgements）

- WebView 不直接触达系统能力：✅（经 `browser_*` command / `httpBridge`）。
- 分层：✅（`adl-browser → adl-types` 为低层依赖；`kernel` 辅助已 `pub(crate)`）。
- 凭据：N/A。
- 红绿测试：❌ 见 N1（regex 分支无语义级保护）。
- 单端可用：✅ 预览桥显式降级（unsupported + toast）。
- i18n 硬编码：✅ 新增文案全走 `t.*`（N5 已拆 key）。
- 蓝色/提示色：✅ 新增 CSS 仅用 `--bg-muted`/`--surface-subtle`/`--surface-hover`/`--border*`/`--text-*`，token 均在 `themes.css` 定义。
- 未发布阶段兼容代码：✅ 无迁移/兼容分支。
- 注释与代码逐句相符：✅ N4 五处已核对（ui-manual 按 P5）。
- 异步状态变更：✅ `openFileInNewWorkspace` 在 await 后重新取 `added.rootPath` 计算相对路径，失败只中止本文件并在资源管理器定位。
