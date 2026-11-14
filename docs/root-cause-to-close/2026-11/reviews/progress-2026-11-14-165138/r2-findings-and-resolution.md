# R1 / R2 最终轮定向复核结论

## R1 rev4 — 定向复核（file-icon 注释 ×3，splash 接线用例桩）

**splash：通过（0 需修复）**

- 桩在 `render()` 之前装到 `Element.prototype.getAnimations`，正负两条用例互为首尾：无参数时 `pause` 未调用且 `currentTime` 保持 `null`；`?adl-splash-at=1200` 时 `currentTime === 1200` 且 `pause` 被调用。
- 负向用例的桩是**承重件**：jsdom 26 无 `getAnimations`，去掉桩后即使回退成 `Number(params.get(...))` 也不会 pause → 会假绿。桩必须保留。
- 组件在 `at === null` 时直接 return，`animation.currentTime = at` 的 `at` 已窄化为 `number`，不可能产生 `null`，故「未触碰」与「显式设 null」不可混淆。
- 实跑：`tsc --noEmit` 通过、eslint/prettier 通过、5 条接线用例通过。

**file-icon：仍有 1 项（low）** → 已修：Tier 5 注释「mapped these」把 LICENSE 也纳入映射范围，而旧表并无 license 条目；改为「mapped Dockerfile / Makefile to …」。

## R1 rev5 — 定向复核（Tier 5 注释范围）

通过（该轮只含上一条修复）。

## R2 rev5 — 完整清理轮

- **splash：本轮零问题**。死代码/冗余守卫/多余防御/诊断日志/注释一致性逐项确认；源码内 `[DBG-` 仅剩卫生检查器自身的规则定义（带 `hygiene-allow`）。
- **file-icon：3 项需修复 low + 2 项可选**：
  1. 两个用例名仍用「special filename」概念，且弱用例 `handles special filename Dockerfile` 已被强断言用例覆盖 → 删除弱用例 + 重命名；
  2. `fallbackIcons.tsx` 头注释「只有内部字形不同」与实现不符（通用文档无字形）→ 改写；
  3. Tier 3 外层 `if (extension)` 冗余 → 去掉（内层判空保留）；
  4. `index.ts` barrel 多导出 4 项（预存）→ 记录不修（包对外表面，收敛属独立提交）；
  5. 三处注释重复复述历史理由 → 记录不修（就近可读性）。

## R2 rev6 — 定向复核（上述 3 项修复）

**定向复核通过**：

- 删除弱用例后 `Dockerfile` 仍由 `toHaveLength(2)` 强断言覆盖，无缺口；
- `FALLBACK_EXTENSION_MAP['']` 为 `undefined`，去掉外层守卫后 `extension === ''` 仍落 Tier 4→Tier 5，行为不变；Tier 4 的 `if (extension)` 是分流条件，保留正确；
- 头注释与三个图标的 path 数量（2/3/4）逐条对上；
- 无新增死代码/冗余/命名不一致。

附带发现（均转 P5 或独立事项）：进度文档过期条款（P5 已订正）、`FALLBACK_EXTENSION_MAP` 走原型链的预存缺陷（`a.constructor` 会取到函数，改前同样存在）—— 记入进度文件「遗留」，建议后续用 `Object.hasOwn` 或 `Map` 处理。
