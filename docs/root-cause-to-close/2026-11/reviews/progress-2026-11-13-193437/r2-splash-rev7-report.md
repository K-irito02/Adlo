# R2 定向复核报告 — 开屏改版（rev7）

## 范围

基线 `e16d96659`，快照 `-rev7`（只读快照，未跑 `git diff/show`，未改源码）。只核 rev6 提的 2 项 low 是否闭合 + 清理是否引入新问题：

- `adlo/frontend/src/app/components/StartupOverlay.css`（187 行，rev6→rev7 删 4 条声明）
- `adlo/frontend/scripts/check-no-cjk-source.mjs`（仅豁免口径注释，rev6→rev7 改写）
- 连带核对（blob 与 rev6 一致，未变）：`StartupOverlay.tsx`（`4acd44a2b`）、`__tests__/StartupOverlay.css.test.ts`（`c12d685d6`，99 行）、`__tests__/StartupOverlay.test.tsx`（`5344348c9`）

未实跑测试（本轮只删 CSS 声明与改注释，`StartupOverlay.css.test.ts` 的 4 条断言均不涉及被删声明，blob 未变即可判定不受影响；真机读数沿用派发方提供的 5176 `getComputedStyle` 结果，我逐条核对语义一致性，未重跑）。

## 上轮问题关闭情况

| rev6 项 | 结论 |
|---------|------|
| F1 `check-no-cjk-source.mjs:18-20` 把豁免口径写成「两种语言字典取值相同」，与开屏常量不在字典的事实冲突 | **已闭合**（见下） |
| F2 `StartupOverlay.css` 5 处 no-op 声明（保留 brand 的 `pointer-events`） | **已闭合**（见下） |

### F1 — 已闭合（口径与事实逐句对齐）

新文本（`check-no-cjk-source.mjs:18-20`）：「以及**不可本地化、不进入 i18n 字典**的品牌常量（例如开屏的「Adlo · 安洛」——两种语言下都原样显示）」。

逐句核对：

| 断言 | 验证 | 结论 |
|------|------|------|
| 「不进入 i18n 字典」 | `src/app/i18n/**` 全文无 `Adlo · 安洛`（复算：命中仅 `StartupOverlay.tsx:4,6`、`StartupOverlay.test.tsx:23`、`AboutSettings.test.tsx:198`）；`StartupOverlay.tsx:4-6` 明写「故不进 i18n 字典」 | 准确 ✓ |
| 「不可本地化」 | `GLOSSARY.md:10`「英文名 Adlo，中文名安洛，并列书写为「Adlo · 安洛」」，品牌名不做翻译 | 准确 ✓ |
| 「两种语言下都原样显示」 | `StartupOverlay.tsx` 只 import React 与组件 CSS，不读任何 i18n；`BRAND_LOCKUP` 是模块级字面量，语言切换不触达 | 准确 ✓（绝对断言有代码支撑） |
| 不再声称「字典取值相同」 | 该口径已删除；新口径不会误覆盖 `brandHoverName`（zh `安洛` / en `Adlo`，在字典内、取值不同），也不会与关于页 `aboutAppNameZh`（两语言同值、在字典内）混为一谈 | 边界正确 ✓ |

只改注释，未触用户已确认的 `cjk-source-allow` 品牌常量豁免。

### F2 — 已闭合（4 条删除均为零视觉差异，保留项正确）

rev7 实际删除（工作树行号）：`.adl-splash` 的 `cursor: default`（原 :20）、`.adl-splash__sweep` 的 `pointer-events: none`（原 :82）、`.adl-splash__rule` 的 `transform-origin: center`（原 :98）、`.adl-splash__name` 的 `text-align: center`（原 :109）。保留 `.adl-splash__brand { pointer-events: none }`（现 :55）。无其它改动（新版 187 行 = 191 − 4）。

逐条复核「零差异」的机制，而非只看读数：

| 删除项 | 为什么零差异 | 连带损失评估 |
|--------|--------------|--------------|
| `.adl-splash { cursor }` | 覆盖层无事件监听；全部文字位于 `.adl-splash__brand`（`pointer-events: none`，**继承**到子树），文字因此不是命中目标；`__name` 另有 `user-select: none`（:107）。剩余可命中层只有 `.adl-splash` 自身与 `.adl-splash__grid`，两者都是普通 div，`auto` 与 `default` 同为箭头。`body` 无 `cursor` 声明，无祖先可继承出 I-beam/wait | 无语义损失：覆盖层本就非交互；`index.html:44` 的 `#preload-overlay` 仍声明 `cursor: default`，替换瞬间光标不变 |
| `.adl-splash__sweep { pointer-events }` | `pointer-events` 是**继承属性**，`.adl-splash__brand` 的 `none` 已覆盖整棵子树（mark → img/sweep）；读数 `sweep.pointerEvents=none` 即继承值，删除前后同值 | 无。仅当将来把 sweep 移出 brand 才需重新声明（当前 DOM（`StartupOverlay.tsx:34-39`）不会） |
| `.adl-splash__rule { transform-origin }` | `transform-origin` 初始值 `50% 50%` ≡ `center`；读数 `48px 0.5px` 正是 96×1 元素的默认中心，说明计算值与删除前**完全相等**，`scaleX(0)→1` 的展开中心不变 | 无 |
| `.adl-splash__name { text-align }` | 该元素是 `flex-direction: column` + `align-items: center`（:50-52）的 flex item，交叉轴尺寸 = fit-content，且 `white-space: nowrap`（:106）→ 盒子宽度恒等于文本宽度；读数 `boxWidth = clientWidth = scrollWidth = 185` 印证无多余宽度，`center` 与 `start` 的字形位置逐像素相同（居中由 flex 提供，不依赖 `text-align`） | 见下「文本溢出」专项 |

**「某语言/字体下溢出」专项**（派发方点名）：不成立。
1. 文案是常量 `BRAND_LOCKUP`，**不随语言变化**（组件不读 i18n），不存在「另一种语言更长」的情形；
2. 盒子是 fit-content，换 fallback 字体只会让盒子与文本同步变宽，`text-align` 依然无可作用；
3. 唯一可能出现差异的是「盒子被压到窄于文本」——需要视口 < 185px；窗口最小宽度 640px（`adlo/AGENTS.md` 设计系统约束），且派发方窄档回归只到 500px 量级，**不可达**；
4. `nowrap` 保证不换行，因此也不存在「多行文本需要居中」的路径。

**保留项正确**：`.adl-splash__brand { pointer-events: none }` 是这棵子树唯一的显式非交互声明，删后 sweep/mark/name 全部变为可命中（虽无监听器，但语义退化），保留符合 rev6 建议。

## 新增发现

**本轮零问题**（critical 0 / high 0 / medium 0 / low 0）。

清理未引入新问题，逐项核对：

1. **结构完整**：8 个类与 7 个 `@keyframes` 的引用关系未变；reduced-motion 清单（现 :179-187）仍与 `ANIMATED_LAYERS` 同序等值；`.adl-splash` 仍含 `z-index: var(--z-max)`（:17）供样式锁断言。
2. **样式锁不受影响**：`StartupOverlay.css.test.ts` blob 未变（`c12d685d6`），其 4 条断言只涉 `animation` 声明清单/时长 token、`.adl-splash` 的 `z-index`、`@keyframes adl-splash-grid-drift` 的 `translate3d(32px, 32px`，与本次删除的 4 条声明无交集；`getComputedStyle` 读数亦证明删除后计算值等于删除前的期望值（`48px 0.5px`、`none`、`185/185`）。
3. **注释口径未漂移**：CSS 头部「基础样式 = 动画终态」「偏离登记（`letter-spacing` + `padding-left`）」等段落所指声明全部仍在；全文无注释提及 `cursor` / `text-align` / `transform-origin`，删声明未留失效说明。
4. **无临时痕迹**：两个改动文件无 `console.*` / `[DBG-` / `TODO` / `FIXME` / 被注释掉的旧实现。
5. **无新增变量/依赖**：`--splash-*` 消费关系不变（12 时长 + 4 颜色仍逐项有消费方）。
6. **进度文档**：`progress-2026-11-13-193437.md:153-155` 现写「R2 清理轮（rev6）：设置行 1 low … 开屏侧结果待回」，与本轮实况不矛盾（尚未回写）；主代理收到本报告后应把该句替换为「开屏 F1/F2 已闭合、rev7 零问题」，并同步「需修复 2 → 0」——属回写义务，不计缺陷。

## 记录不修（供下一轮与 P5 参考，均为非缺陷）

- **`cursor` 语义从「显式 `default`」变为「继承 `auto`」**：当前零差异（上文已证），但语义上开屏不再自证「非文本光标」。若将来把 `--font-sans` 换成会触发 I-beam 的路径，或移除 brand 的 `pointer-events: none`，需重新评估；届时补一条根层 `cursor: default` 即可。
- **`text-align` 移除后的隐式前提**：品牌字标居中现在**只**依赖 `.adl-splash__brand` 的 `align-items: center`；若将来把字标改成可本地化文案或多行，需要重新加回 `text-align: center`（当前 `white-space: nowrap` + 常量，不可达）。
- **`.adl-splash__sweep` 的可命中性依赖父层**：一旦 sweep 被移出 `.adl-splash__brand`，它将成为可命中元素（虽无监听器，但会改变 `cursor` 来源）；移动该节点时补 `pointer-events: none`。
