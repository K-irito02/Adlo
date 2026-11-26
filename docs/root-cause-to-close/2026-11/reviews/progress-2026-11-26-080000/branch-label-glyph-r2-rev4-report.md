# branch-label-glyph — R2 rev4 审查报告

## 范围

- 工作树：`e:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-2`；rev4（base=`a94a8ce25d`，单提交 `3b0a3c47f`），按 `manifest-rev4.md` 的 scope ownership 只审两个归属文件：
  - `adlo/frontend/src/styles/regions/rightpanel/git-visualization.css`（`:219-231`，新增 `:226-230`）
  - `adlo/frontend/src/styles/git-vis-branch-label.test.ts`（新文件，34 行）
- 只读上下文（不产出 finding）：`app/features/git-visualization/charts/BranchGraph.tsx:839-879`（按钮内联 `fontSize: 11` / `lineHeight: 1`，span 仅 `title`）、`styles/testing/cssRules.ts:65-83`（`exactRuleBody` 取完全同名规则并剥规则体内注释）、`docs/root-cause-to-close/2026-11/progress-2026-11-26-080000.md:10-22`（P3 实测输出）。
- R2 只查：死代码 / 冗余守卫 / 根因修复后多余防御 / 应删或降级的诊断日志 / 注释冗余或与实现不符。
- 方式：只读源码 + rev4 快照 diff + rev2/rev3 快照比对（本 scope 两文件 rev2→rev3→rev4 逐字相同）+ 级联与删除性推演。未运行测试、未启动 dev server / 浏览器（未占用任何端口）、未执行任何 git 命令。

## 上轮问题关闭情况（逐条）

1. **R1 rev1 F1（low，CSS 注释含绝对断言 `always`）— 仍为已关闭。**
   `git-visualization.css:226-229` 现文为「`normal` uses the font's own line box (ascent + descent), so those descenders stay visible.」，无 `always`/必然/总是 一类绝对词；指向本组件的下伸部，与 progress `:19` 的 `after … glyphBottom:12 / gDescenderClipped:false` 一致。`.review-diffs/` 无 `claims-ack*` 文件，与「无绝对断言」互证。
2. **R1 rev1 F2（low，测试注释指向错误文件 / 未说明复刻页）— 仍为已关闭。**
   ① `git-vis-branch-label.test.ts:16-17` 现写「删掉 `regions/rightpanel/git-visualization.css` 里本规则内的 `line-height: normal`」，与实际位置（CSS `:230`）一致；② `:12-14` 明确写出「用同款字体与行盒的**复刻页**在真实浏览器实测」并附 `before clientHeight=11 / glyphBottom=11.5`、`after clientHeight=12 / glyphBottom=12`，与 progress `:18-19` 原样输出逐项相符。
3. **rev2 结论「零问题」的复核 — 成立。** 本 scope 两文件在 rev3、rev4 未再变动（`.review-diffs/*-rev3.diff` 与 `*-rev4.diff` 对本 scope 完全一致），rev2 之后无新改动引入的回归。

## 新增发现

无。

R2 类别逐项核对结果：

- **死代码 / 冗余守卫**：新增内容只有一个声明 `line-height: normal`（有直接消费方：`BranchGraph.tsx:860` 的省略号 span），无新死代码、无多余 fallback 或双重守卫。
- **根因修复后多余防御**：修复为「元素自身声明覆盖继承值」的最小形态，未叠加 padding / `!important` / 额外包裹；`overflow: hidden` + `text-overflow: ellipsis` 是既有截断契约，不是新增防御。
- **诊断日志**：两文件均无 `console.*` 或调试残留。
- **注释冗余 / 与实现不符**：CSS 注释与测试头注释各自面向不同读者（样式维护者 / 测试维护者），未重复到可合并的程度；逐句与实现相符——「The label button sets line-height: 1」对应 `BranchGraph.tsx:856` 的内联 `lineHeight: 1`；「1em（11px）」= `fontSize: 11` × `lineHeight: 1`；「ascent+descent（实测 12px）」对应 progress `:19` 的 `fontBoundingBoxAscent:10 + fontBoundingBoxDescent:2`。
- **测试有效性（删除性推演）**：`exactRuleBody` 剥离规则体内注释（`cssRules.ts:69-83`），故 `toContain('line-height: normal')`（`:32`）只能被真实声明满足；删掉 CSS `:230` 即变红。三条断言与标题「省略号 span 用字体自带行盒，避免下伸字母被 overflow 裁切」一一对应，无「标题承诺多于断言」。
- **单一定义前提**：全仓 `grep adl-branch-graph__label-text` 仅 `git-visualization.css:219` 一处规则定义（其余为组件/测试引用），无第二份覆盖、无 `!important`、span 无内联 `line-height`，锁的「单一规则体」前提成立。

## 记录不修

- `git-visualization.css:225` 的 `vertical-align: top` 对文本 span 实际不生效：父按钮内联 `display: inline-flex`（`BranchGraph.tsx:854`），span 为 flex item，`vertical-align` 不参与 flex 布局。属本轮之前既有的死声明（rev4 diff 未触及该行），删除对当前渲染零影响，留作日后 CSS 死声明批量清理，本轮不改。
- 真实组件（非复刻页）的 `getComputedStyle` 未采集：P3 证据来自真实 Chromium 上复刻 label 样式的测量（progress `:18-19`）。级联竞争面已静态闭环——全仓仅一处规则、无 `!important`、元素自身声明恒胜继承值，故本轮判定为已充分验证；若主代理按简报 §5.7 要求补真实元素证据，一行即可：`node adlo/scripts/ui-probe.mjs --url <预览地址> --selector ".adl-branch-graph__label-text" --props line-height,height`。
- CSS 注释「the font's own line box (ascent + descent)」是简化表述（含 line gap 的字体 `normal` 行盒会大于 ascent+descent）；对本处实测字体 `halfLeading:0` 成立，措辞精度属可选优化（rev2 已记录，维持不改）。
- 注释示例「"gitee/…" renders as "qitee/…"」为「g→q」示意，仓库内无可证伪的真实分支名；不改（rev2 已记录）。
- 测试头注释「文字 span 又用 `overflow: hidden` 做单行省略」为简写：省略号实际来自 `text-overflow: ellipsis`（`overflow: hidden` + `nowrap` 为必要条件，三者在 CSS 与断言中均存在）；rev2 已记录。
- 文本锁 `exactRuleBody` 只取第一处同名规则体：日后若在同文件尾部追加同名选择器，锁不会发现后者覆盖（既有样式锁通病，rev2 已记录）。
- 文档类：`progress-2026-11-26-080000.md:14` 仍引用 `git-visualization.css:219-226`，而规则现为 `:219-231`（新增注释 3 行 + 声明 1 行）；进度文件的事实/行号同步归 P5，不计入 R2 需修复项。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
