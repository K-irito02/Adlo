# branch-label-glyph — R1 rev2 审查报告

## 范围

- 工作树：`e:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-2`；rev2（base=`a94a8ce25d`），按 `manifest-rev2.md` 只审本 scope 两个归属文件：
  - `adlo/frontend/src/styles/regions/rightpanel/git-visualization.css`（`:219-231`）
  - `adlo/frontend/src/styles/git-vis-branch-label.test.ts`（全文 34 行）
- 方式：只读源码 + rev2 快照 diff + `progress-2026-11-26-080000.md:18-19` 的 P3 实测输出核对 + `exactRuleBody` 实现核对 + 删除性推演。未运行测试、未启动 dev server / 浏览器（无端口占用），未执行任何 git 命令。
- 旁证文件（只读上下文，不产出 finding）：`charts/BranchGraph.tsx:839-862`（按钮内联 `fontSize: 11` / `lineHeight: 1`，span 无内联样式）、`styles/testing/cssRules.ts:65-83`（`exactRuleBody` 只取完全同名规则且剥离规则体内注释）。

## 上轮问题关闭情况（逐条）

1. **F1（low，CSS 注释绝对断言）— 已关闭。**
   - 现文（`git-visualization.css:226-229`）：「`normal` uses the font's own line box (ascent + descent), so those descenders stay visible.」，原「always contains the full glyph」已删除。
   - 核对：注释不再含 `always`/`必然`/`总是`/`永远` 等绝对词；「those descenders stay visible」指向本组件的下伸部，且由 P3 实测 `gDescenderClipped:false`（`fontBoxHeight=12` ≥ `glyphBottom=12`）可证，属可验证表述而非普适承诺。另 `.review-diffs/` 无 `claims-ack*` 文件，与「无绝对断言」一致。
2. **F2（low，测试注释指向错误文件 / 未说明复刻页）— 已关闭。**
   - ① 删除性推演现写「删掉 `regions/rightpanel/git-visualization.css` 里本规则内的 `line-height: normal`」（`git-vis-branch-label.test.ts:16-17`），指向正确：该声明在 CSS `:230`，测试只 `readFileSync` 该文件（`:19-22`）；相对路径 `src/styles/` → `regions/rightpanel/git-visualization.css` 成立。
   - ② 现写「用同款字体与行盒的**复刻页**在真实浏览器实测」（`:12-14`），与进度文件 `:18`「`measure-label.mjs $env:TEMP\label-measure.html`（复刻 label 样式）」一致，不再把复刻页写成真实组件测量。
   - ③ 已补越界数字：`before clientHeight=11 / glyphBottom=11.5（越界 0.5px）`、`after clientHeight=12 / glyphBottom=12（未越界）`，与进度文件 `:19` 原样输出逐项相符（`before: 11 / 11.5 / halfLeading -0.5`；`after: 12 / 12 / halfLeading 0`）。
   - 顺带核对：注释里的 `1em（11px）` 与实现一致——按钮内联 `fontSize: 11` + `lineHeight: 1`（`BranchGraph.tsx:850,856`），span 无内联覆盖；「ascent+descent（实测 12px）」与 `fontBoundingBoxAscent 10 + fontBoundingBoxDescent 2` 相符。

## 新增发现

无。

本轮修复未引入回归：
- 测试标题「省略号 span 用字体自带行盒，避免下伸字母被 overflow 裁切」与三条断言一一对应（`overflow: hidden` / `text-overflow: ellipsis` / `line-height: normal`，`:29-32`），无「标题承诺多于断言」。
- 删除性推演仍成立：`exactRuleBody` 剥离规则体内注释（`cssRules.ts:69-83`），故断言只钉声明；删掉 `line-height: normal` 后 `:32` 转红。
- 全仓 `grep adl-branch-graph__label-text` 确认样式定义仍只有 `git-visualization.css:219` 一处（其余为测试与组件引用），无第二份覆盖规则，锁的「单一规则体」前提未变。
- CSS 注释与实现未漂移：注释描述的 `line-height: normal` 与 `:230` 声明一致；无残留旧术语。

## 记录不修

- 行盒余量为 0（`fontBoxHeight 12` = `glyphBottom 12`）：当前字体/字号下不裁切，零余量属方案固有边界；换字体或字号需重测（rev1 已记录）。
- CSS 注释「the font's own line box (ascent + descent)」是简化说法：含 line gap 的字体 `normal` 行盒会大于 ascent+descent；对本处实测字体（`halfLeading 0`）成立，不影响行为，属措辞精度可选优化。
- 注释示例「"gitee/…" renders as "qitee/…"」为 rev1 既有文案，仓库内无可证伪的真实分支名；仅为「g→q」的示意，不改变行为，不改。
- 测试注释「文字 span 又用 `overflow: hidden` 做单行省略」属简写：省略号实际来自 `text-overflow: ellipsis`（`overflow: hidden` + `nowrap` 为必要条件，三条均在 CSS 与断言中）。
- 文本锁 `exactRuleBody` 只取第一处同名规则体：若日后在 CSS 尾部追加同名选择器，锁不会发现后者覆盖（既有样式锁通病，rev1 已记录）。
- 文档类（`docs/root-cause-to-close/**`）：进度文件事实/措辞留给 P5 同步，不计入本表。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
