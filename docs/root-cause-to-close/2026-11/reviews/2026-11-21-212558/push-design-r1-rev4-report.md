# push-design R1（rev4 定向复核）— 报告

## 范围

只读 rev4 快照（`.review-diffs/*-rev4.diff`），并对照工作区源码核验；未运行 `git diff/log/show`，未改源码/配置，未跑测试，未启动 dev server / 浏览器。

本轮只确认 r1-rev3 的 N3（prompt scoped 规则压掉忙碌扫光）是否关闭。rev4 相对 rev3 的改动面只有两处（其余相关文件 diff index 未变）：

- `styles/regions/composer-core.css` 的 scoped prompt 规则；
- `styles/button-semantic-standard.test.ts` 的对应断言。

核验文件：`composer-core.css`、`button-semantic-standard.test.ts`、`button.css`（忙碌规则）、`ClipboardHistoryHeader.tsx`（当前实际受影响的非 soft prompt 忙碌按钮）、`FileCreationDialog.tsx`（soft 按钮）、`Toasts/Dialog` 相关样式与 `index.css` 加载顺序。

## 上轮问题关闭情况

- **r1-rev3 N3（prompt 非 soft 忙碌按钮丢失扫光/文字变不可读）— 已关闭**：
  - `composer-core.css:162-167` 的 scoped 规则已只设 `--btn-bg: var(--bg-elevated)`、`--btn-fg: var(--text-primary)`、`--btn-bd: transparent`（外加既有外观需要的 `border: none`），**不再直接声明 `background`/`color`**；`:hover` 规则同样只设 `--btn-bg: var(--bg-hover)`（`:169-171`）。
  - 忙碌规则 `.adl-btn[aria-busy='true']:not(.adl-icon-btn)`（`button.css:48-67`，0-3-0）直接声明 `background: linear-gradient(...)` / `color: transparent`，现在不再被 scoped 规则的同异性声明压掉；基础 `.adl-btn`（0-1-0）的 `background: var(--btn-bg)`/`color: var(--btn-fg)` 更低，故忙碌态接管成功。`::before` 的底色取 `--btn-bg`（scoped 的 `--bg-elevated`），扫光高光/基色取 `--btn-fg`（scoped 的 `--text-primary`）：亮色 `#222`/`#f8f8f8`、暗色 `#d8d8d8`/`#141414` 均可见，且静止→忙碌背景不跳色。
  - 当前实际触发点 `ClipboardHistoryHeader.tsx:374-380`（prompt 内 `adl-btn--primary` + `aria-busy={clearing}`）的忙碌态因此恢复扫光与可读文字；`pointer-events:none` / `cursor:progress` 仍由忙碌规则提供。
  - 锁已同步：`button-semantic-standard.test.ts:47-62` 取 scoped 规则体，断言含 `--btn-bg:` / `--btn-fg:`，并以 `/^\s*background:/m`、`/^\s*color:/m` 负向断言**不含直接** `background`/`color`；同时仍断言 unscoped 规则为 null、hover scoped 规则存在。
- **非 busy 的 ghost/primary 既有外观 — 保持**：基础 `.adl-btn` 消费 scoped 的自定义属性 → `--bg-elevated` 填充、`--text-primary` 文字、透明边框（scoped 直接 `border: none` 保持 0px，与旧外观一致）；`:hover` 为 `--bg-hover`；`--square` 的 `border-radius: 0 !important`（`composer-core.css:154-156`）未变。soft 变体仍被 `:not([class*='-soft'])` 排除，按 `button.css` 的 token 生效（`FileCreationDialog` 的 `primary-soft` 确认键不受影响）。
- **R1 F1–F7 / R2 N1、N2 — 未被 rev4 破坏**：rev4 只改了上述两个文件；`gitFileOpsActions.ts`（`3c006893f`）、`WorkspaceChangesActions.ts`（`f2af03590`）、`WorkspaceChangesActions.test.tsx`（`725812bc6`）、`errorToastSlice.ts`（`5947fe45e`）、`file-operations.css`（`80d23679f`）、`loading-row.test.ts`（`599779edc`）、`toast-card.css`（`f8a524111`）、`button.css`（`b9f1deb4a`）、`PushPreflightDialog.tsx`（`4969bba53`）的 diff index 与 rev3 相同，F1–F7 与 N1/N2 的关闭证据（前缀清卡、焦点陷阱、hook 用例、conflicts/level/重读 ahead/gitOpsBusy、reduced-motion 跨文件回退、summary gap/neutral-soft、level/重试/ahead=0/取消）全部原样成立。

## 新增发现

无（本轮为定向复核，未发现 rev4 引入的需修复问题）。

## 记录不修

- **忙碌态真实计算样式仍建议复采**：本轮按「scoped 只设自定义属性 + 忙碌规则可接管 + 测试负向断言」口径确认关闭；建议 P5/视觉验收对 `ClipboardHistoryHeader` 清空确认的 busy 态补一次亮暗两套 `getComputedStyle`（文字色/背景/动画），作为机械证据。
- **hover scoped 规则的负向断言**：测试只对基础 scoped 规则做 `background:`/`color:` 负向断言，未对 hover scoped 规则重复同一检查；当前 hover 只设 `--btn-bg`，且忙碌时 `pointer-events:none`，风险很低，可选补一条。
- **`border: none` 保留**：scoped 规则除三个自定义属性外仍直接写 `border: none`；这是保持旧外观 0px 边框所必需，且不参与忙碌扫光竞争，符合本轮验收口径。
- **FileCreationDialog 的 ghost 取消 / `--square` 0 圆角**：按 r1-rev3 已确认的「ghost/primary 既有外观不变」决策保持；若「全 soft / 2px」要覆盖该对话框需另立需求。
- **其余历史记录**：图标忙碌态 pointer-events、`String.replace('{branch}')` 的 `$&` 边界、注释措辞、分支 chip 半透明、`resolveWorkspaceTarget` 回落、分支失败重试 fire-and-forget、retry 预读与 busy 窗口——本轮未触碰，维持 R2 记录。
- **文档/原型**：`docs/**`、`prototype/*.html` 不在本轮范围。
- **进程/端口**：未启动任何服务，未跑测试。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）
