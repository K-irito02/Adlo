---
description: 门禁脚本棘轮策略——diff-only 断言拦新增 + baseline 兜底存量 + 内联 opt-out（no-new-any-allow）
globs: adlo/scripts/**,adlo/frontend/scripts/**
alwaysApply: false
---

# 治理门禁脚本棘轮：diff-only 断言 + baseline 兜底 + 内联 opt-out

## 规则描述

`adlo/scripts/check-*.mjs` 系列门禁（`check:repo` 的人工/脚本层）统一采用“**只拦新增、宽容存量**”的棘轮（ratchet）策略，避免历史债务阻塞增量开发，又保证债务单调不增：

1. **Diff-only 断言**（`check-no-new-any.mjs`）：读取 `git diff --cached -U0`，只检查 `+` 开头的新增行；违规则列 `file :: text` 并 exit(1)。旧代码里的存量违规完全不触碰。
2. **Baseline 兜底**（`check-ui-manual-selectors.mjs`、`check-css-globals.mjs`）：把已知违规写入随仓库存放的 `*.baseline.json`（或内置 BASELINE 集合），`problemKey = relativePath :: message` 作为稳定键；检查时拆分 fresh（新增，报错）与 baselined（存量，静默）；`--update-baseline` 参数可整体重写 baseline，用于“确认修复后同步收缩白名单”。
3. **内联 opt-out**（`no-new-any-allow` 注释）：极少数确需豁免的新增行，在行尾加标记即放行，且约定“必须在 review 中说明理由”。
4. baseline 文件顶部 `note` 字段约定“应保持 0 项，修改前先确认”，让存量债务始终显式、可审计。

与 `quality-gates.md`（门禁清单与执行时机）互补：本规则约束的是**门禁脚本内部如何判断违规**。

## 正确示例

```sh
# 提交时：只拦本次新增的 `as any`
git commit            # pre-commit → node scripts/check-no-new-any.mjs
# 确认修复存量后收缩 ui-manual baseline
node scripts/check-ui-manual-selectors.mjs --update-baseline
```

```ts
// 新增的合法豁免（review 说明理由）
const state = store.getState() as any; // no-new-any-allow：zustand 切片类型联合过大
```

## 错误示例

```js
// ❌ 全量扫描源码然后要求零违规——存量问题会让门禁永远红，逼人绕过 pre-commit
if (BANNED.test(wholeFileContent)) process.exit(1);
```

```json
// ❌ 为图省事往 baseline 里添加“本来就有违规”来掩盖新问题——
//    往 baseline 添加前必须先在 PR 中登记理由
```

## 适用场景

- 为某条规则（lint 覆盖不到的语义/文案/选择器类约束）新增门禁脚本时，默认采用 diff-only 或 baseline 棘轮，不要全量零容忍；
- 存量债务清理：修复一批后跑 `--update-baseline` 收缩白名单，形成单调递减；
- 存量文件无法立即修复时：把“文件 :: 消息”键加入 baseline 并在 PR 描述中登记，而不是注释掉检查。
