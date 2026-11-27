# 审查子代理共享简报（R1 / R2）

派发审查子代理时，先让它读本文件，再只给「本轮范围 / 要验证的上轮项 / 报告路径」。不要把本文件内容重复粘进每个提示词。

> 本简报是 P4 审查的唯一契约；`SKILL.md` 只讲流程与门控。两者冲突时，以 `SKILL.md` 的阶段门控与本简报的审查细则为准。

## 1. 快照与只读约束

**主代理每轮命令（子代理不执行）**：

```powershell
# 在 <worktree>/adlo 下执行
# 每个 rev（修复轮）：check:review = 静态项 + Rust fmt/clippy（无 vitest / cargo test）
# 脚本默认 `--base merge-base`；若手工跑 check:changed 且改动已提交，也必须用 `--base merge-base`，
# 否则 base=HEAD 且工作区无改动时门禁会直接失败（防止假绿）。
pnpm --dir frontend run check:review
# 仅当本轮所有 scope 零问题（P4 收尾候选）：完整门禁（含 vitest）
pnpm --dir frontend run check:changed
```

**完整门禁只跑一次**：只有“本轮所有 scope 都零问题、准备进 R2 / 退出 P4”的那个 rev 才跑 `check:changed`；其余 rev 一律 `check:review`。2026-11-22 实测：完整门禁单次 230–237s；2026-11-24 的 13 个 rev 中在多数 rev 重复跑完整门禁，白耗约 30–40 分钟。

- **范围归属**：派发前写一份 `--scopes <json|file>`（可传内联 JSON 或 JSON 文件路径，形状见下），快照会生成 `## Scope ownership` 并拒绝同一文件归入多个 scope。启用 `--scopes` 时，**每个 review 文件都必须有 owner**；存在未归属文件时快照直接失败，确有人工例外才用 `--allow-unowned`。每个文件只有一个 owner；其他 scope 只读上下文、不产出 finding。
  ```json
  {
    "browser-injection": ["adlo/crates/browser/src/init_script.js", "adlo/crates/browser/src/webview2_*.rs"],
    "downloads-lifecycle": ["adlo/src-tauri/src/commands/download_commands.rs"]
  }
  ```

- 仓库根：以主代理在提示词里给出的工作树为准。
- 快照目录：`.review-diffs/`；本轮清单：`manifest-rev<N>.md`（由 `review-snapshot.mjs` 生成）。快照会临时 `git add -N` 未跟踪文件，并在退出时恢复索引；若手工生成快照，提交前自行 `git reset -- <untracked>`，否则 `lint-staged` 会拒绝 intent-to-add。
- 快照文件命名：仓库相对路径中的 `/` 和 `.` 换成 `_`，后缀 `-rev<N>.diff`。
- **只看本轮 rev**，不要复用旧快照、不要看增量 diff。
- 子代理禁止运行 `git diff/log/show`，禁止修改源码/配置；只允许写自己的报告文件。
- **自行启动的 dev server / 浏览器 / headless Chrome 必须在返回前终止**，使用临时端口与临时数据目录；报告需列出用过的端口并确认已关闭，禁止留下后台进程。
- 临时脚本、复算输出、重定向文件只能写到 `$env:TEMP` 或 `.review-diffs/tmp/`；禁止写进源码树（快照会拒绝纯数字等临时文件名）。
- 需要上下文时读取工作区源码（绝对路径）。
- **不运行测试套件**：不跑 `check:changed`、多文件/全量 vitest、`cargo test --workspace`。判断测试有效性用删除性推演：读用例 + 读实现，说明删掉修复后哪个断言会变红。只有「必须实跑才能判定」时才跑单个测试文件，并在报告里注明跑了哪个；最终门禁由主代理执行。
- `review-snapshot.mjs` 现在会为新增注释中的绝对断言生成 `claims-ack-rev<N>.md`；未逐条标 `[x]` 时快照命令以非零退出，先核对代码/测试再放行。

## 2. 规约来源（先读再判断）

- 仓库根 `AGENTS.md`、`adlo/AGENTS.md`
- `.agents/rules/`（按范围选读）：`review-judgements.md`（判断项必读）、`dev-rules.md`、`mandatory-testing.md`、`quality-gates.md`、`phase-boundary.md`、`hint-color-usage.md`、`rust-patterns.md`、`shell-encoding.md`
- `docs/development/project-engineering-constraints.md`
- `docs/design-system/`（UI 变更）
- Tauri capability / internals 事实：`docs/knowledge-base/tauri-backend/tauri-capability-window-webview-remote.md`（改链接、ACL、`__TAURI_INTERNALS__` 相关注释前先核对）
- `GLOSSARY.md`、`CONTEXT.md`
- 需求真源：进度文件 `docs/root-cause-to-close/YYYY-MM/progress-*.md` + 相关 ADR。
- 工具：审查「关于 → 第三方声明」数据时，用 `pnpm --dir adlo run notices:inspect`（`-- --package <name>` 看单包明细）复算重复正文 / 未覆盖 id / 来源分布，不要自写复算脚本。

**审查范围**：代码与其注释、i18n 文案、测试、配置。**不审文档**：`docs/**`（含 `docs/operations`、`docs/knowledge-base`、`docs/design-system`、`docs/root-cause-to-close`、`docs/superpowers`）、`GLOSSARY.md`、根与 `adlo` 的治理/说明文档（`AGENTS.md`、`README.md`、`CONTRIBUTING.md`、`RULES.md`、`SKILLS.md`、`SECURITY.md` 等）、`.agents|.opencode|.trae/**` 规则与技能——这些由主代理在 P5 统一同步并逐项表态，快照默认也不生成它们的 diff。发现文档问题不要写进「需修复项」，可在「记录不修」注明留给 P5；代码注释/i18n 与实现不符仍必须报（属代码范围）。

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
- **依赖既有行为**：若本轮实现依赖某条既有行为，而上游 ADR 对该行为有明文决定，必须核对该 ADR 与代码是否一致（不限于本轮 diff 行）。
- **跨 IPC 错误哨兵**：Tauri 命令 `Err(CommandError)` 经 `AppError` 的 Display 会带前缀（如 `Internal error: downloads_active`），且 `invoke` reject 的是普通对象而非 `Error`。消费者用 `===` 比对裸哨兵在真实链路永不命中：必须从 plain-object rejection 显式取 `.message` 并用 `includes` 匹配；仅当前端自己生成的 message（如 `REFRESH_FAILED`）可用严格相等。
- **复用记录开新一轮**：DB 记录被 reset 复用为新一次尝试时，所有被下游当作查找键的字段（url / file_path / tab id 等）必须一并刷新，否则按旧键查找的完成事件、原生 operation 与缓存会失配。

### 4.1 异步状态变更专项（R1 必查）

凡 diff 涉及 `await`、保存/写盘、缓存或受控编辑器，逐条核对：

- 每个 `await` 落定后是否重新读取决定分支的状态（草稿、选中路径/工作区、当前上下文）；不得用 await 前的快照写回。
- 失败路径与「外部内容」路径是否会把不可信内容写入之后被当作可信基线的缓存。
- 受控输入是否可能被 store 基线更新反向覆盖；识别同时充当「持久值 + 编辑值」的字段。
- 同一资源的并发写是否有串行/代际守卫；旧响应是否可能晚到落地并清掉新状态。
- 失败是否只中止目标操作，而不是全局阻塞所有文件/入口。
- **一次性初始化守卫**（`initializedRef` 等）：是否按领域键（workspace / chart / tab）作用域化，或能证明 effect 自身收敛（写入后判据立即为假）；全局布尔守卫会把「第一次不巧」固化成永久缺省（2026-11-26 实证：默认时间范围只写首个 workspace，三个图表的时间范围控件消失）。

## 5. 每轮必查的强制项（R1/R2 通用）

- **注释与实现漂移**：diff 里每个被改动函数/组件，其相邻注释都要与最终行为对照；注释承诺得比实现多，按需修复项处理（不是风格问题）。
- **用户推翻旧决策**：用户中途改变的交互/策略（例如取消某个提示、改变检查时机），必须在同一变更里更新对应 ADR 或术语表；只在代码里改而文档保留旧约束，按 medium 报。

1. **测试有效性**：对每个修复项问「删掉该修复，测试会变红吗？」不能变红的用例不算回归保护。回归用例必须从公共入口进入；禁止把 `as unknown as` 调私有方法/读内部字段作为唯一断言，也禁止“缓冲在旧 key、断言新 key”这类空断言。**以运行时值（文件名/扩展名/ID）为键查对象字面量时必须走自有属性（`Object.hasOwn`），并有用例覆盖 `constructor` / `__proto__`**——第三方库内部同样会沿原型链索引，必要时在调用前拦截（2026-11-14 实证：`a.constructor` 取到 `Object` 构造函数直接炸渲染）。
2. **持久化元数据原子性**：新增/修改落盘元数据（标记、指针、选中记录）是否与它描述的内容同一次原子落位？失败路径会不会留下半成品且被后续静默错用？
   2.1 **ADR/决策与代码漂移**：本轮若改动了某条 ADR 明文记载的产品/实现决策（如「判重只在目标容器内」「用户可选允许重复」等），必须在本轮内同步修订该 ADR（如 0017 直改原文并保留 strikethrough 说明）或显式 superseded，不得跨轮/跨收尾搁置——「代码与 ADR/GLOSSARY 两套权威打架」比频繁改 ADR 代价更大（2026-11-10 实证：ADR 0017 #6 直到用户手动触发 domain-modeling 才被发现）。
3. **多来源/多腿部分失败**：一条来源失败而其它成功时，是否被当成完整结果？`latest/available` 是否会误报「已是最新」？预发布/未知标记是否如实。
4. **代码注释/i18n 与实现一致性**：只核对代码注释与 i18n 文案；进度文件与设计文档的事实漂移不在 R1/R2 范围（P5 修正），不要据此判「需修复」。不要把手工验证写成自动化测试。
5. **领域术语**：ADR/CONTEXT 新引入的领域术语是否登记 `GLOSSARY.md`（P5/R2 必查）；新增/修改的注释与文档是否使用了 `_Avoid_` 词（`check:glossary` 覆盖 i18n 与 `docs/operations`、`docs/architecture`，代码注释需人工核对）。
6. **Rust 导出**：新增 `pub` 是否真有跨 crate 消费方？lib 内部辅助默认 `pub(crate)`；仅测试调用的包装应删除或降级。
   6.1 **Cargo feature/依赖的隐式类型依赖**：建议删除 Cargo feature 或依赖前，先确认被调用 API 的**参数/返回类型**是否来自该 feature（如 `RegCreateKeyExW` 的 `SECURITY_ATTRIBUTES` 来自 `Win32_Security`）。**宏与构建脚本生成的引用同样不可用文本零引用判死**（`#[implement]` 展开引用 `windows_core::`、`generate_context!` 等；2026-11-26 实测按“零引用”删 `windows-core` 直接编译失败）。无法确认就写进「记录不修」，或要求删除后以 `cargo clippy`/`cargo check` 编译通过为准。
7. **UI/主题真实渲染**：本轮若有 CSS/主题改动，主代理必须附真实浏览器/WebView 的 `getComputedStyle` 证据（至少当前主题；涉及亮暗 token 时两套都读）。仅有 CSS 文本断言、截图或肉眼判断，视为未验证级联，记为需修复。证据用 `node adlo/scripts/ui-probe.mjs --url <预览地址> --selector <css> --props <计算属性>` 采集（Edge/Chrome CDP，无新依赖；先启动 `dev:preview`），不要为取样式占用 Review 面板。
8. **注释与文案必须与最终代码逐句相符**：新增/修改的注释或 i18n 文案若含绝对断言（必然 / 总是 / 永远 / 不会 / 不可达 / 唯一 / 所有…都 / 全部…都 / 都会 / 一律），必须能由代码或测试证明，否则要求降级措辞；不许把「意图」写成「事实」。同时回扫本轮被取代的旧流程术语（例如「按需登记」「所有可见列表」）是否仍留在注释/文档里。本仓实测：注释漂移占满了 R1/R2 后半场（3 轮完整审查 + 5 次定向复核全在核注释/文案/计数）。
9. **测试标题/注释必须与断言一致**：用例名承诺的行为至少有一个会失败的断言；标题写「A 与 B」而只断言 A、写「recovers / 同名 / 删除」却无对应断言，均按「失效文案」记为需修复。删除性推演时先看标题承诺，再看断言是否真能变红。
10. **IPC/JSON 响应字段必须有读取方**：新增或保留的 serde 字段 / TS interface 字段 / mock 字段若没有任何读取点，按死代码处理；仅用于排障的字段需在契约注释说明，并确实被日志或诊断消费。

## 6. 报告契约

**报告前缀由当前阶段决定，不由审查内容决定**：针对 R1 finding 的定向确认仍写 `<scope>-r1-rev<N>-report.md`；只有 `check-review-gate.mjs --phase r2` 通过后，才写 `<scope>-r2-rev<N>-report.md`。把 R1 复核写成 r2 会让门控继续读到 R1 非零（2026-11-22 实测：多花一轮三份确认）。

写入主代理指定的 `.review-diffs/<scope>-r1-rev<N>-report.md`（R2 用 `<scope>-r2-rev<N>-report.md`）。主代理可先用 `pnpm --dir adlo run review:report -- create <path> --scope <scope> --phase <r1|r2> --rev <N>` 生成骨架；子代理只在该文件写入内容。报告必须包含：

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
- 需修复项：N（critical/high/medium/low 各 N）；N=0 也必须写「需修复项：0」，可另附「本轮零问题」说明
```

「需修复」= critical/high/medium，或会改变行为/事实的 low（错误注释、失效引用、错误文案）。纯风格、可选优化、已记录理由的保留项不算。**文档类 low（`docs/**`、治理文档、`.agents|.opencode|.trae` 中的事实/措辞/测试标题）不在 R1/R2 范围：不要写进主表，放「记录不修」并注明 P5 处理。**

**降噪约定：**

- 主表只列「需修复」项；可选/风格/记录不修项统一放在「记录不修」一节，一行一条，不进入主表。
- 每个 scope 的 low 最多 3 条；超过时合并为一条概括，细节放报告末尾，避免淹没高价值发现。
- **复审收敛（rev≥2）**：主表只收「上一轮主表 finding 未关闭」与「本次修复引入的回归 / 契约错误」；更早的 pre-existing low 放「记录不修」（除非会改变行为或事实）。目标是把零问题收敛到修复质量，而不是无限挖历史旁支。
- **同一 rev 批量修低危项**：R1/R2 的多条 low 在同一轮一次修完，下一轮只对已修项做定向复核；禁止一项一个 rev（2026-11-22 实测：R2 的注释/测试锁类 low 分散修导致 rev2→rev6 五个快照）。

返回消息只给：报告路径 + ≤5 行摘要 + 「需修复项：N」。主代理收到后必须先运行 `pnpm --dir adlo run review:report -- check <报告路径>`，确认文件实际存在、必要章节齐全、结论行合法，再运行 `check-review-gate`；子代理的口头“已写入”不算物证。

## 7. 不修理由

误报、过期快照、用户特殊设计、合理边界校验可以「不修」，但必须：写清验证过程与理由；由主代理转写进进度文件；下一轮派发时把理由粘给子代理，允许其异议。
