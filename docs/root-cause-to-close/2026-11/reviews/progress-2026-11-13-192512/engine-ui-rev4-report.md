# R1 定向复核报告 — rev4：engine/UI 三项（F1 二次外部变更 base / F2 aria-controls / F3 记录措辞与 CSS 证据）

- 快照：`.review-diffs/manifest-rev4.md`（base `e16d96659`，41 files）；逐文件 `*-rev4.diff`
- 上轮：`.review-diffs/engine-ui-rev3-report.md`（3 项：medium 1 / low 2）
- 依据：`.agents/skills/root-cause-to-close/references/review-brief.md`；根 `AGENTS.md`、`adlo/AGENTS.md`
- 方法：只读快照 diff + 读工作区源码交叉核对；**未执行任何 `git` 命令**
- 实跑：仅 2 个单测文件（见下），未跑 `check:changed`/全量
  - `pnpm --dir adlo/frontend exec vitest run src/app/components/settings/AgentSiteRulesPanel.test.tsx src/app/components/settings/AgentSiteRulesControl.test.tsx`
  - 结果：2 files / **24 tests passed**（Panel 21 + Control 3），无失败、无 act 警告

## 范围

本轮只复核 rev3 三项修复，不重审整个 engine scope：

1. `adlo/frontend/src/app/components/settings/AgentSiteRulesPanel.tsx`（外部变更 effect + 备份 effect）及其 `AgentSiteRulesPanel.test.tsx`
2. `adlo/frontend/src/app/components/settings/AgentSiteRulesControl.tsx` 及 `AgentSiteRulesControl.test.tsx`
3. `adlo/frontend/src/app/components/settings/agentSiteRulesDraftBackup.ts`（无 rev4 语义变化，仅核对与面板调用一致）
4. 旁证：`adlo/frontend/src/styles/components/settings.css:2988-3001`；`docs/root-cause-to-close/2026-11/progress-2026-11-13-192512.md`

说明：`AgentSiteRulesPanel.tsx` / 其 test 在 rev4 快照中仍是「new file」（base→HEAD 全量），因此本轮以工作区源码 + rev3 报告的行号对照来定位 rev4 改动点，未复用任何旧 diff。

## 上轮问题关闭情况（逐条）

### F1 [medium] 同一会话第 2 次外部变更时备份 `base` 不刷新 —— **已关闭**

修复落点：`AgentSiteRulesPanel.tsx:655-681`（检测 effect）、`:662-672`（dirty 分支）、`:666-671`（`writeBackup`）、`:681`（deps）。

① **第 2 次变更后备份 base 是否为新签名：是。**
- `:656` 取 `nextSignature = configSignature(value)`；`:660-661` 立即推进 `lastValueSignatureRef` / `configBaseRef`；`:666-671` 用 `base: nextSignature` 直写备份，不再等 state 翻转。
- 第 2 次变更时 `setExternalConfigChanged(true)` 是 no-op，但备份已在 effect 内写好，因此重开时 `loadBackup`（`:188-219`）的 `parsed.base === configSignature(value)` 成立，草稿可恢复。
- 顺序无隐患：检测 effect 声明在备份 effect（`:685-713`）之前，同一 commit 内先写 `base=新签名`；随后若 `externalConfigChanged` 翻转让备份 effect 重跑，其 `base: configBaseRef.current`（`:694`）已是新签名，且 `externalChanged: externalConfigChanged`（`:697`）为 true，两次写入内容一致。
- 与自写回流不冲突：`save()`（`:549-563`）与恢复 effect（`:609-638`）、`resetSiteOverride`（`:597-603`）都在 `onChange` 前同步推进基线，故父层 value 回流时 `globalDirty/allSitesDirty` 为 false → 走 clean 分支（`:674-680`），不会被误判成外部变更、也不会写错 base。

② **deps 扩展（`value/globalDirty/allSitesDirty/globalDraft/item.id/siteDrafts`）是否引起循环/覆盖草稿：否。**
- 循环：每次 dirty 变更都会重跑 effect，但 `:657-659` 的签名比较会立即 return；clean 分支（`:674-680`）的 setState 只会在签名变化那一轮触发一次，下一轮即 early-return。无自激循环。
- 覆盖草稿：`writeBackup` 写的是本次渲染闭包的 `globalDraft/siteDrafts`（`:668-669`），而这两个值本身在 deps 内，故写入内容始终是「最后一次已提交渲染」的草稿，不存在用陈旧草稿覆盖新草稿的窗口；也不会把干净作用域误写成备份（干净走 `:674` 分支或由备份 effect `:689-691` 清除）。
- 未新增越权写：脏分支仍保留「不采纳新配置」语义（`:672` return），不会覆盖用户草稿。
- 一处可接受的绕过（记录项，非缺陷）：检测 effect 不受 `suppressAutoSave/discardRef` 约束，但结构性重置路径 `SettingsControls.tsx:208-226` 在同一次点击里 `setOpenRulesId(null)` 使面板卸载，卸载 cleanup（`:745-753`）见 suppress 即清备份，因此不会留下脏备份。

③ **新用例是否「删掉修复即红」：是（删除性推演 + 实跑通过）。**
- 用例 `AgentSiteRulesPanel.test.tsx:359-412`。删除修复（去掉 `:666-671`）后：第 2 次 `rerender` 只写 ref（`:660-661`），不触发任何 setState → 无重渲染 → 备份 effect 的 deps（`:699-712`）全部未变 → 不重跑 → 备份仍是 `base=S2`，`:401-402` 的 `expect(backupAgain.base).not.toBe(backup.base)` **变红**。
- 第二重（更强）：`:407-411` 用第 2 次签名的 item 重挂载，`loadBackup` 要求 `base === 新签名`；base 未刷新时备份被丢弃、输入框回落成 `Rule A`（而非 `Draft name`），断言变红。
- 该用例不是「空断言」：它从公共入口（面板挂载/输入/卸载/重挂载）出发，未用 `as unknown as` 调私有实现（测试内的 `as unknown as` 只用于构造 `item.value` 夹具，`:371-375`、`:390-393`，不参与断言对象）。

### F2 [low] 收起态 `aria-controls` 指向未挂载面板 —— **已关闭**

- `AgentSiteRulesControl.tsx:57`：`aria-controls={open ? 'adl-agent-site-rules-panel' : undefined}`。
- 展开态仍有效：`open={openRulesId === item.id}`（`SettingsControls.tsx:318`），仅展开时挂载面板（`:327-335`），面板 `section` 的 id 为 `adl-agent-site-rules-panel`（`AgentSiteRulesPanel.tsx:816`），IDREF 一定命中，且全局同时只允许一个 `openRulesId`，不会出现重复 id。
- 测试无冲突：`AgentSiteRulesControl.test.tsx:72-94` 用恒定名 `settingsAgentRulesEdit` 取按钮并断言 `aria-expanded`，不涉及 `aria-controls`；`SettingsControls.test.tsx:283-287` 在展开后 `getElementById('adl-agent-site-rules-panel')` 断言存在，与新行为一致。两份用例实跑均通过。
- 附注：当前**没有**任何断言覆盖 `aria-controls` 的收起/展开差异，删掉 `open ? … : undefined` 不会变红（见「记录不修」第 1 条）。

### F3 [low] 记录措辞与 CSS 证据 —— **已关闭**

- 措辞（rev3 的 `:124` 绝对断言）：进度文件已无「本轮仅删除…无计算样式变化」类句子（全文检索 `仅删除`/`无计算样式变化` 均无命中）；`:122-127` 改为按 rev3 修复项逐条记录，`:130-141` 单列「门禁提醒（CSS 计算样式）」并给出实采值，不再把新增规则说成「仅删死声明」。
- `as unknown as` 已限定范围：`:114`「新增的 **opening 用例**不再使用 `as unknown as`（`check-no-new-any` 只扫 stores，已实测通过）」。核对 `AgentSiteRulesPanel.test.tsx` 仍有 5 处 `as unknown as`（`:61,174,192,207,371`），但它们属于 engine/UI 用例，句子限定后成立。
- CSS 证据与代码/令牌逐条一致：
  - 规则本体 `settings.css:2988-3001`：`@container (max-width: 300px)` 内 `.adl-agent-rules__text-btn[data-copy-state='error'] { border-color/color: var(--danger) }` —— 与「仅在容器 ≤300px 且 error 态生效」一致（边界 `max-width` 含 300px）。
  - `--danger: #e9967a`（`themes.css:106` 亮 / `:389` 暗）= `rgb(233,150,122)`，与记录一致。
  - 对照值也可复算：`--text-secondary` 暗 `#9a9a9a` = `rgb(154,154,154)`（`themes.css:347`）、亮 `#767676` = `rgb(118,118,118)`（`:64`）；`--border-subtle` 暗 `rgba(255,255,255,0.08)`（`:356`）、亮 `rgba(34,34,34,0.08)`（`:73`）—— 与 `:137`/`:139` 的四组数值完全对应。
  - 320px「规则不生效」与 `max-width: 300px` 的容器查询边界一致。
- 采样方法与结论表述匹配（真实 Chromium / Vite dev + 真实 `index.css` / `getComputedStyle`，临时 harness 已删除），属「已采集并登记」，非「仅有 CSS 文本断言」。

## 新增发现

无（本轮三项修复未引入新问题）。

## 记录不修（观察，均不计入需修复）

| # | 观察 | 判定 |
| --- | --- | --- |
| 1 | F2 无回归用例：`AgentSiteRulesControl.test.tsx` 未断言 `aria-controls` 的收起/展开差异，删掉修复不会变红（简报 §5.1 意义上「不算回归保护」）。 | 属 low 且不改行为/事实，本轮判不修；建议顺手补一行 `expect(button.getAttribute('aria-controls')).toBeNull()` / 展开后 `toBe('adl-agent-site-rules-panel')`。 |
| 2 | **预存**（非本轮引入）：面板自身发起的 `resetSiteOverride`（`AgentSiteRulesPanel.tsx:597-603`）会改变 `value` 签名；若此时全局草稿仍 dirty，检测 effect 会把它当「外部变更」，置 `externalConfigChanged=true`（footer 提示「配置已在外部变更，保存将覆盖外部写入」，并阻断卸载自动保存）。rev3 及之前同形存在，rev3 完整审查未列；rev4 的 `writeBackup` 反而让该草稿在重开时更不易丢。 | 不属本轮复核范围（3 项修复之外），且无数据丢失；建议后续单独评估是否按「面板自写」打标豁免，不阻塞本轮收口。 |
| 3 | **预存**：进度文件 `:110` 记录「10 处 `--text-2xs` 后段同选择器覆盖（2968/3011/3014/3031/3076/3124/3134/3142/3150/3232）」中的行号已随 rev3/rev4 的 CSS 增删漂移（当前 3011 为空行，3031/3142/3150/3232 不是 `font-size` 行）。实质结论仍成立：`src/styles` 内已无任何 `--text-2xs` 残留（全文检索 0 命中） | 记录项（rev2 遗留，rev3 未列），建议改引用选择器而非行号；不影响三项修复的关闭结论。 |
| 4 | 进度文件 `:137`/`:139` 的对照写法「无该属性 → …」：组件实际恒渲染 `data-copy-state`（`AgentSiteRulesPanel.tsx:866`，idle/ok/error 三态），采集对照的语义应为「非 error 态（idle）」；四组数值本身与令牌一致（见 F3） | 措辞级，不改变结论，判不修；如要严谨可改为「idle 态」。 |

## 结论

- 上轮 3 项：**全部关闭**（F1 medium / F2 low / F3 low），且 F1 具备「删掉修复即红」的双重断言支撑（实跑通过）。
- 新增发现：0（三项修复未引入新回归；F1 的 deps 扩展未造成循环或草稿覆盖，F2 展开态仍有效，F3 的记录与代码/令牌一致）。
- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——**本轮零问题**。
- 门禁提醒（未执行，留给主代理）：`pnpm --dir frontend run check:changed`；本轮实跑范围仅上面 2 个测试文件。
