# R2 清理审查报告 — rev5

## 范围

- 快照：`.review-diffs/manifest-rev5.md`（base `3f7a4a8`，5 commits，90 files；逐文件读 `*-rev5.diff`，锁文件与进度文档除外）。
- 只审清理面：死代码、修复后残留的冗余守卫、已不必要的防御代码、无消费方的导出、过期/失实注释、遗留诊断日志、重复实现。**不重审功能正确性**（R1 已关闭）。
- 规约依据：`.agents/skills/root-cause-to-close/references/review-brief.md`（§3 气味基线、§4 本仓专项、§5.8 注释逐句相符）、根/`adlo/AGENTS.md`、`.agents/rules/dev-rules.md`。
- 约束遵守：未运行 git、未改源码；证据全部来自 rev5 快照 + 工作区源码直读 + `grep`。

## 上轮问题关闭情况

本轮为 rev5 首次 R2（rev4 为 R1 定向复核，结论零问题），无 R2 上轮项。派发时给定的「已记录不修」清单逐条核对后**全部接受、未重复计入**：

| 记录项 | 核对结果 |
| --- | --- |
| 预览 dev 服务无 `/workspace/add`（桌面专属） | 一致：`preview-workspace.ts` 显式降级为 `INTERNAL_ERROR` 文案 |
| `docs/operations/ui-manual/.../settings.md` 行（P5） | 一致：台账在进度文件 P5 待办 |
| `useBrowserPanelMetaWiring` 别名 | 一致：`_handlePageMeta = handlePageMeta` 仍在（本报告不重复计入） |
| `ensureProtocol` 盘符死分支 | 一致：P5 台账 |
| `pendingNavigationsRef` 只写不读 | 一致：接口参数保留、不再下传 |
| `browserActiveTabId` 恢复期不变量（P5） | 一致：P5 台账 |
| 中心 hook 冗余 `state.isTauri` | 一致：`useCenterBrowserAddressSubmit.ts:100` |
| CSS 计算样式探针跳过（用户目视） | 一致：本轮新增 CSS 全部 `.adl-agent-site-rules*` 作用域 + 既有 token |
| `/workspace/add` 快照行断言省略 | 一致：集成用例只断言「不激活 + 侧栏含条目」 |

## 新增发现

### F1 [severity: medium] [category: 设计] 标题落库逻辑在 `applyMetaBroadcast` 与 `handlePageMeta` 中重复，且注释声称「共用同一实现」

- 位置：`adlo/frontend/src/app/features/browser/useBrowserPageMeta.ts:83-99`（`applyMetaBroadcast`）与 `:122-144`（`handlePageMeta` 的 `exact` 分支）；失实注释在 `:73-78`
- 描述：两处是同一逻辑形状——`normalizeMetaUrl` → 按 `normalizeUrlForDedup` 过滤同 URL 标签 → `applyBroadcastTitle` 门控 → `browserUpdateTab({title,titleResolved})` → `titleSourceRef.set` → `browserUpdateHistoryTitle`。仅两处细节不同：`applyMetaBroadcast` 用 `p.source`，`handlePageMeta` 用 `effectiveSource`；后者历史标题写入未加「命中标签或历史已有该 URL」门控。`applyMetaBroadcast` 的 JSDoc 写「广播处理器与原生 meta 接线共用同一实现」，实际原生接线（`useGlobalBrowserMeta` → `handlePageMeta`）走的是另一份拷贝，只共享 `applyBroadcastUpdate`/`applyBroadcastTitle`，注释与代码不符。
- 证据：源码直读（见上两段行号）；`grep -n "applyMetaBroadcast"` 只命中定义处与 `useBrowserPageMeta` 自身订阅，无第二消费方。该文件注释里带 `R2 回归`/`R3 回归` 标记，说明 title-source 门控历史上已被两处漂移咬过。
- 建议修复：抽 `applyTitleToMatchingTabs(cleanUrl, title, source): void`（含门控与 `titleSourceRef`），两处各调用一次；或让 `handlePageMeta` 的 `exact` 分支直接复用 `applyMetaBroadcast({url, title, faviconUrl, faviconDataUri, source: effectiveSource})`，再保留 `activeTab` 兜底与 `!isFileMeta` 上报。修完后 `:73-78` 的注释才成立。

### F2 [severity: low] [category: 死代码] `openFileByMethod` 目标确定后仍有不可达的 `!rel` 分支；`toFileUrl` 兜底与其注释矛盾；`OpenFileOutcome` 无消费方

- 位置：`adlo/frontend/src/app/features/preview/openByMethod.ts:247-251`（不可达守卫）、`:97-100`（`toFileUrl` 兜底 vs 注释）、`:166-167`（`OpenFileOutcome` 注释与导出）
- 描述：
  1. `const target = explicit && explicitRel !== null ? explicit : owner;` 之后 `if (!target) return 'opening'`；随后 `const rel = workspaceRelative(target.root, absPath); if (!rel) { void openFileInNewWorkspace(...); return 'opening'; }`。target 只可能是 `explicit`（此时 `explicitRel !== null`，同一纯函数再算一次必非 null）或 `owner`（`resolveOwningWorkspace` 已用 `isWithinRoot` 过滤），故 `!rel` 不可达——修复 workspace 归属时留下的旧兜底。
  2. `toFileUrl` 注释「只传良构 URL，不传裸 Windows 路径」，实现却是 `toLocalFileUrl(absPath) ?? toForwardSlashes(absPath)`：兜底返回的是裸路径（如 POSIX `/home/x/a.md` 或畸形盘符路径），与注释相反，且 `openExternal` 拿到裸路径只会被 shell 作用域拒绝。
  3. `OpenFileOutcome` 注释「调用方据此决定是否提示用户」，实际 3 个调用点（`useBrowserAgentLinkSubscription.ts:58`、`openByMethod.ts:333/348`）全部丢弃返回值；`grep -n "OpenFileOutcome"` 仅命中定义与函数签名，属于无消费方的猜测性 API。
- 证据：上述行号直读 + `grep -n "openFileByMethod|OpenFileOutcome"`（22 处命中，全部不读返回值）。
- 建议修复：删掉 `:247-251` 的 `!rel` 分支（保留 `!target` 分支）；`toFileUrl` 改成返回 `string | null` 或直接内联 `toLocalFileUrl` 并让调用方在 null 时提示「无法解析为本地路径」（同时修正注释）；`OpenFileOutcome` 若确无消费需求，收回导出并改为 `void`，或让调用方真的用它区分 toast。

### F3 [severity: low] [category: 死代码] `agentSiteRules.ts` 的 `overrideForOrigin` 零调用方；三个常量导出范围过大

- 位置：`adlo/frontend/src/shared/agentSiteRules.ts:127-131`（`overrideForOrigin`）、`:3-19`（`BUILTIN_AGENT_SITE_RULE_ID` / `DEFAULT_AGENT_SITE_MATCH_SELECTOR` / `DEFAULT_AGENT_SITE_ATTRIBUTES`）
- 描述：`overrideForOrigin` 在整个 `frontend/src` 中只有定义、没有任何 import（`AgentSiteRulesControl` 自己用 `siteDraft.find(...)` 内联实现同一查找）。三个常量只在同文件 `defaultAgentSiteRules` / `normalizeAgentSiteRules` 内部使用，`export` 属无消费方包装（本仓「未发布阶段不留无调用方 pub 包装」）。另 `AgentSiteRulesControl.tsx:22` 的 `DEFAULT_SELECTOR` 与 `DEFAULT_AGENT_SITE_MATCH_SELECTOR` 是同一字面量的第二份拷贝。
- 证据：`grep -n "BUILTIN_AGENT_SITE_RULE_ID|DEFAULT_AGENT_SITE_MATCH_SELECTOR|DEFAULT_AGENT_SITE_ATTRIBUTES|overrideForOrigin"` → 9 处命中，全部在本文件内；`overrideForOrigin` 仅定义行。
- 建议修复：删除 `overrideForOrigin`；三个常量去掉 `export`（保留 `const`）；`AgentSiteRulesControl` 改为复用 `DEFAULT_AGENT_SITE_MATCH_SELECTOR`（若保留导出则仅这一个有意义）。

### F4 [severity: low] [category: 死代码] `init_script.js` 内置默认规则数组是生产不可达的兜底，且构成第 4 份默认值副本

- 位置：`adlo/crates/browser/src/init_script.js:77-89`（`__adlDefaultAgentRules` 与 `__adlGetActiveAgentRules` 的回落）
- 描述：`window.__adlAgentRules` 由注入前缀无条件写入——`browser_navigation.rs:36-53` 的 `init_script_with_background_and_agent` 对规则序列化后总是赋值（空数组也赋值），`browser_webview_setup.rs:234` 与 `:912`（silent）是仅有的两个 builder 入口；`browser_set_agent_intercept` 运行时刷新也写这四个全局。而使用该兜底的唯一路径 `__adlFindAgentFileLinkMatch` 在 `:122` 先 `if (!__adlIsAgentHost()) return null`，`__adlIsAgentHost()` 依赖同一前缀写入的 `__adlAgentOrigins`——即：前缀缺失时兜底也永远不会被用到；前缀存在时 `__adlAgentRules` 必然已定义。故 `__adlDefaultAgentRules` 生产不可达（现仅被单测通过「beforeEach 删除全局」间接依赖）。
- 证据：`grep -n "init_script_with_background"`（仅 `and_agent` 被 builder 调用，`init_script_with_background` 仅被其内部拼接）；`init_script.js:19-25/122` 的门控链；`initScriptNavigation.test.ts:264-275` 在 `beforeEach` 删全局来回到兜底。
- 建议修复：删除 `__adlDefaultAgentRules`，`__adlGetActiveAgentRules` 改为 `var globalRules = Array.isArray(window.__adlAgentRules) ? window.__adlAgentRules : [];`；`initScriptNavigation.test.ts` 的默认规则用例显式 `setAgentRules([...内置默认...])`（更贴近真实注入）。这样默认值只剩 Rust（`kernel/config.rs:246-272`，另 `types/config.rs:311-327` 是第二份 Rust 副本）+ 前端渲染副本，并在 `init_script.js` 注释里补「默认规则真源在 Rust」的同步标记。

## 记录不修

一行一条（可选优化/纯风格/已记录理由，不进入主表）：

1. `centerOverlay.ts:12-16` 的 `addressExpanded?: boolean` 只写不读——但注释已声明它是「让回归测试能明确断言不计入 overlay」的类型级探针，删字段会让该用例失去编译期约束；保留。
2. `localFileInput.ts:46-57` 的 `isLocalFileInput` / `buildLocalFileUrl` 是对 `shared/localFilePath` 的纯转发（Middle Man），3 个调用点可直接改用共享模块；仅命名语义收益，保留。
3. `useCenterBrowserAddressSubmit.ts:100-104` 复制了主路径 `:187-192` 的 `isTabInPool` + `navigateTabInPool().catch(console.warn)` 块；其中重复的 `state.isTauri` 判断已记录不修，重复块本身 5 行、合并需抽局部函数，收益有限。
4. `AgentSiteRulesControl.tsx:314` 的 `!rawValue || !('kind' in rawValue)` 与 `:317` 的 `rawValue.rules` 解引用不自洽（`rawValue` 为 `undefined` 时会抛，而 `''` 又不会），且 `:317-319` 对类型必填的 `rules/overrides/sites` 用 `??` 兜底属死防御；当前 `SettingItem.value` 必填，不可达。
5. `browser_navigation.rs:50-51` 的 `rules = rules, overrides = overrides` 与 `format!` 内联捕获 `{rules}` 重复（`enabled = agent_intercept_enabled` 才有必要），纯风格。
6. `browser.rs:24` 与 `browser_webview_setup.rs:219` 新增 `#[allow(clippy::too_many_arguments)]`：`agent_site_rules`/`agent_site_overrides` 恒成对穿过 bridge→command→builder→init_script 五层（Data Clump），后续可合并为 `AgentSiteRuleConfig`；本轮带注释接受。
7. Rust 默认规则字面量两处（`kernel/config.rs:246-272`、`types/config.rs:311-327`）重复，跨语言另有 TS/JS 副本；除 F4 的 JS 死兜底外，建议给 `types/config.rs` 的默认函数补「与 kernel/前端默认一致」同步注释。
8. `localFileInput.ts:66-71` 的 `catch { pathname = url.pathname || ''; }` 重新赋值与初始值相同（`decodeURIComponent` 失败时原值仍是初值），微冗余。
9. `init_script.js:129-130` 的 `el.matches &&` 守卫（`Element` 恒有 `matches`；仅 `target` 可能是非 Element 时才需要）与 `:128` 的 selector 默认值兜底（normalize 两侧已保证非空），防御性冗余，无行为影响。
10. 未发现遗留诊断日志：`grep "DBG-|ADL-DEBUG"` 在 `adlo/` 源码零命中（仅 `check-source-hygiene.mjs` 的模式定义）；新增 `console.warn`（`useCenterBrowserAddressSubmit.ts:102/190`、`useBrowserPanelAddressSubmit.ts:171`）符合 `.agents/rules/error-handling.md` 的「catch 至少 console.warn」要求，非遗留调试日志。

## 结论

- 需修复项：4（critical 0 / high 0 / medium 1 / low 3）
- 其余 9 条为记录不修（可选优化/纯风格/已记录理由），不计入需修复；第 10 条为「遗留诊断日志」核查结果（零命中）。
