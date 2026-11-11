# 审查子代理共享简报（R1 / R2）

派发审查子代理时，先让它读本文件，再只给「本轮范围 / 要验证的上轮项 / 报告路径」。不要把本文件内容重复粘进每个提示词。

## 1. 快照与只读约束

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`（以实际工作树为准；由主代理在提示词里给出）。
- 快照目录：`.review-diffs/`；本轮清单：`manifest-rev<N>.md`（由 `review-snapshot.mjs` 生成）。
- 快照文件命名：仓库相对路径中的 `/` 和 `.` 换成 `_`，后缀 `-rev<N>.diff`。
- **只看本轮 rev**，不要复用旧快照、不要看增量 diff。
- 子代理禁止运行 `git diff/log/show`，禁止修改源码/配置；只允许写自己的报告文件。
- 临时脚本、复算输出、重定向文件只能写到 `$env:TEMP` 或 `.review-diffs/tmp/`；禁止写进源码树（`adlo/frontend/11` 这类纯数字临时文件会被快照拒绝）。
- 需要上下文时读取工作区源码（绝对路径）。
- `review-snapshot.mjs` 现在会为新增注释中的绝对断言生成 `claims-ack-rev<N>.md`；未逐条标 `[x]` 时快照命令以非零退出，先核对代码/测试再放行。

## 2. 规约来源（先读再判断）

- 仓库根 `AGENTS.md`、`adlo/AGENTS.md`
- `.agents/rules/`（按范围选读）：`review-judgements.md`（判断项必读）、`dev-rules.md`、`mandatory-testing.md`、`quality-gates.md`、`phase-boundary.md`、`hint-color-usage.md`、`rust-patterns.md`、`shell-encoding.md`
- `docs/development/project-engineering-constraints.md`
- `docs/design-system/`（UI 变更）
- `GLOSSARY.md`、`CONTEXT.md`
- 需求真源：进度文件 `docs/root-cause-to-close/YYYY-MM/progress-*.md` + 相关 ADR。

仓库明文规约优先于下面的气味基线。基线只做启发式判断。

## 3. 气味基线（Fowler ch.3，启发式，非硬性违规）

- **Mysterious Name**：名称不揭示用途 → 重命名。
- **Duplicated Code**：同一逻辑形状出现在多个 hunk/文件 → 提取共享。
- **Feature Envy**：方法过度访问别的对象数据 → 移到数据所在处。
- **Data Clumps**：多个字段/参数总是结伴出现 → 合成一个类型。
- **Primitive Obsession**：原始类型/字符串承担领域概念 → 建小类型。
- **Repeated Switches**：同一类型上的 switch/if 级联反复出现 → 多态或共享映射。
- **Shotgun Surgery**：一个逻辑变更要散改多文件 → 聚合。
- **Divergent Change**：一个文件因多个不相关原因被改 → 拆分。
- **Speculative Generality**：为不存在的需求加抽象/参数/钩子 → 删除。
- **Message Chains**：长链 `a.b().c().d()` → 隐藏在一层方法后。
- **Middle Man**：只做转发的类/函数 → 去掉，直接调用。
- **Refused Bequest**：子类忽略/覆盖大部分继承 → 改用组合。

## 4. 本仓库专项检查

- 未发布产品：禁止数据格式兼容 / 旧版本迁移分支、兼容注释、双格式解析器；外部格式（OS `NO_PROXY`、npm 包名）属外部契约。
- `Option<T>` / `T | null`：区分 `None`、空值、真实值，并有测试。
- 双端一致：Tauri 与浏览器 mock 行为一致；新增 IPC 同步四端桥接。
- i18n：不得硬编码展示文本；语言切换必须有稳定 fallback。
- 切换按钮 a11y：名称随状态变化时不得再加 `aria-pressed`/`aria-expanded`；使用状态属性时名称必须恒定——两者只能取其一。
- 颜色：不得擅自用蓝色（`--accent` 系）作提示/填充色。
- 分层：低层 crate 不依赖高层；WebView 不直接触达系统能力。
- 未发布阶段：不要保留「仅为旧导入路径」的兼容层或无调用方的 `pub` 包装。

### 4.1 异步状态变更专项（R1 必查）

凡 diff 涉及 `await`、保存/写盘、缓存或受控编辑器，逐条核对：

- 每个 `await` 落定后是否重新读取决定分支的状态（草稿、选中路径/工作区、当前上下文）；不得用 await 前的快照写回。
- 失败路径与「外部内容」路径是否会把不可信内容写入之后被当作可信基线的缓存。
- 受控输入是否可能被 store 基线更新反向覆盖；识别同时充当「持久值 + 编辑值」的字段。
- 同一资源的并发写是否有串行/代际守卫；旧响应是否可能晚到落地并清掉新状态。
- 失败是否只中止目标操作，而不是全局阻塞所有文件/入口。

## 5. 每轮必查的强制项（R1/R2 通用）

1. **测试有效性**：对每个修复项问「删掉该修复，测试会变红吗？」不能变红的用例不算回归保护。回归用例必须从公共入口进入；禁止把 `as unknown as` 调私有方法/读内部字段作为唯一断言，也禁止“缓冲在旧 key、断言新 key”这类空断言。
2. **持久化元数据原子性**：新增/修改落盘元数据（标记、指针、选中记录）是否与它描述的内容同一次原子落位？失败路径会不会留下半成品且被后续静默错用？
2.1 **ADR/决策与代码漂移**：本轮若改动了某条 ADR 明文记载的产品/实现决策（如「判重只在目标容器内」「用户可选允许重复」等），必须在本轮内同步修订该 ADR（如 0017 直改原文并保留 strikethrough 说明）或显式 superseded，不得跨轮/跨收尾搁置——「代码与 ADR/GLOSSARY 两套权威打架」比频繁改 ADR 代价更大（2026-11-10 实证：ADR 0017 #6 直到用户手动触发 domain-modeling 才被发现）。
3. **多来源/多腿部分失败**：一条来源失败而其它成功时，是否被当成完整结果？`latest/available` 是否会误报「已是最新」？预发布/未知标记是否如实。
4. **文档与报告一致性**：进度文件中的「零问题/已完成」是否与最新一轮报告逐条一致；不要把手工验证写成自动化测试。
5. **领域术语**：ADR/CONTEXT 新引入的领域术语是否登记 `GLOSSARY.md`（P5/R2 必查）；新增/修改的注释与文档是否使用了 `_Avoid_` 词（`check:glossary` 覆盖 i18n 与 `docs/operations`、`docs/architecture`，代码注释需人工核对）。
6. **Rust 导出**：新增 `pub` 是否真有跨 crate 消费方？lib 内部辅助默认 `pub(crate)`；仅测试调用的包装应删除或降级。
7. **UI/主题真实渲染**：本轮若有 CSS/主题改动，主代理必须附真实浏览器/WebView 的 `getComputedStyle` 证据（至少当前主题；涉及亮暗 token 时两套都读）。仅有 CSS 文本断言、截图或肉眼判断，视为未验证级联，记为需修复。证据用 `node adlo/scripts/ui-probe.mjs --url <预览地址> --selector <css> --props <计算属性>` 采集（Edge/Chrome CDP，无新依赖；先启动 `dev:preview`），不要为取样式占用 Review 面板。
8. **注释与文案必须与最终代码逐句相符**：新增/修改的注释或 i18n 文案若含绝对断言（必然 / 总是 / 永远 / 不会 / 不可达 / 唯一），必须能由代码或测试证明，否则要求降级措辞；不许把「意图」写成「事实」。本仓实测：注释漂移占满了 R1/R2 后半场（3 轮完整审查 + 5 次定向复核全在核注释/文案/计数）。

## 6. 报告契约

写入主代理指定的 `.review-diffs/<scope>-rev<N>-report.md`，包含：

```
## 范围
## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）
## 新增发现
### F1 [severity: critical|high|medium|low] [category: 正确性|设计|副作用|安全|预存|优化|死代码|日志|文档]
- 位置：file:line
- 描述：
- 证据：
- 建议修复：
## 结论
- 需修复项：N（critical/high/medium/low 各 N）；N=0 写「本轮零问题」
```

「需修复」= critical/high/medium，或会改变行为/事实的 low（错误注释、失效引用、错误文案）。纯风格、可选优化、已记录理由的保留项不算。

**降噪约定：**

- 主表只列「需修复」项；可选/风格/记录不修项统一放在「记录不修」一节，一行一条，不进入主表。
- 每个 scope 的 low 最多 3 条；超过时合并为一条概括，细节放报告末尾，避免淹没高价值发现。

返回消息只给：报告路径 + ≤5 行摘要 + 「需修复项：N」。

## 7. 不修理由

误报、过期快照、用户特殊设计、合理边界校验可以「不修」，但必须：写清验证过程与理由；由主代理转写进进度文件；下一轮派发时把理由粘给子代理，允许其异议。
