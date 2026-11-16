## 范围

- rev6 快照（base `4850ebafaf38dc7f0a1c282d71d5418a2329e7b4`）中本 scope 的 14 个 prototype 文件；只核 rev5 R2 的 L1–L3 处置。
- rev5→rev6 实际改动（用两份快照 `+` 行逐行对比，非 git）：`DndPrototype.tsx`（−75B：去掉 `proto-nav__scroll--tabs` 并把该 `<div>` 折回一行）、`FeedbackPrototype.tsx`（−10B：去掉 ` is-static`）、`GhostPrototype.tsx`（−11B：去掉 ` ghost-page`）、`prototype.css`（−18B：删掉基类 `opacity: 0.92;`）；`README.md` / `model.ts` / `feedback.css` / `ghost.css` / 3 个 HTML / 3 个 entry 字节一致 → L1、L2 按「不修」原样保留。
- 手法：静态比对 + 全仓 CSS/TS 反查 + CSS↔标记双向审计 + model 导出外部引用统计；另起一次 headless Chrome（`vite --port 5279`）抽查 D 幽灵的计算样式，跑完已清理进程。未跑测试/构建。

## L3 核对结果（已闭环）

1. **`proto-nav__scroll--tabs` 已删**：`DndPrototype.tsx:1245` 现为 `<div className="proto-nav__scroll" role="tree" aria-label="已打开标签页">`；标签列表内容（空态 / pinned 组 / `proto-pin-divider` / 普通组 / 末端 `proto-tab-end`）结构未变，`proto-nav__scroll` 的滚动与 padding 规则仍在。
2. **`is-static` 已删**：`FeedbackPrototype.tsx:649` 现为 `<div className="fb-line" style={{ top: 29, left: 6, right: 6 }} />`，静态规格线的位置仍由内联样式给出。
3. **`ghost-page` 已删**：`GhostPrototype.tsx:583` 现为 `<div className="fb-page" style={toneStyle}>`；副本页的主题变量仍来自 `body.ghost-proto`（`ghost.css:4-28`，未受影响）。
4. **基类 `opacity: 0.92` 已删**：`prototype.css:494-507` 的 `.proto-ghost-row` 只余 `pointer-events: none`；两处使用点各自显式声明——覆盖态 `511-523`（`opacity: 1`）、放入子行 `532-533`（`opacity: 0.7`），没有第三处消费点。
- 安全性证据：
  - 全仓 `*.css` 搜 `ghost-page|is-static|proto-nav__scroll--tabs` **零命中**（这三个类本来就没有样式，移除不改变外观）；TS/TSX 里也没有 `querySelector` 之类按类名取元素的代码。
  - CSS↔标记双向审计已对称：142 个选择器全部有使用点；标记侧不再有「无对应样式的类名」（脚本输出里剩余的命中都是引号截断造成的伪命中，如 `is-active'`）。
  - headless 抽查 `?variant=D`：幽灵仍是 `position: absolute`、`opacity: 1`（暗/亮均是）、`background: rgb(26,26,26)`、`pointer-events: none`，且 `exactCover: true`（ghost `346/26/372` = 行 `346/26/372`）→ 删掉基类声明后计算样式与 rev5 完全一致。

## L1 保留理由评估：处置同意，两处理由需校正

- `DragPayload` 的 tab `pinned`：「状态镜像」说法成立（与 `tab.pinned` 同值），同意保留。
- `DropView.label`：处置同意（归档件上不值得为 14 处赋值做零收益改动），但**「原型状态镜像」不成立**——inspector 只把 drop 组合成 `kind · container · #index · reason` 字符串（`DndPrototype.tsx:1282-1287`），`label` 既不渲染也不进状态 JSON；它是纯粹的写而不读。建议记录为「无消费者的冗余字段，保留无行为影响」。
- `MIME` + `JSON.stringify(payload)`：处置同意，但**「HTML5 DnD 兼容数据」不准确**——启动拖拽所需的 data 由紧邻的 `setData('text/plain', …)`（`DndPrototype.tsx:426`）满足，自定义 MIME 负载无人读取。建议记录为「无害的自定义负载，保留以便将来移植时区分内部拖拽」。

## L2 保留理由评估：一条事实前提有异议，处置同意

- `applyMove` 的 `target.kind === 'tab'` 守卫：**同意**。「`applyMove` 是导出函数，可能不经组件预校验被直接调用」是站得住的独立入口防线（`model.ts:454-460`）。
- model.ts 的 8 个导出：**对事实前提有异议**。本轮复测（26 个导出逐个统计外部引用）仍是——`OrderState` / `ChildRef` / `MoveResult` / `folderKey` / `entryKey` / `containerExists` / `isDescendantFolder` / `findFolder` 在 `prototype/` 内 **0 引用**；真正被同目录 import 的是另外 18 个。所以「被同目录原型 import」只能算对那 18 个成立，对这 8 个而言「模块 API」是**设计意图**而非引用事实。
- 处置（不删 `export`）**同意**，但建议把理由改写成「以下导出为可移植的模型 API，组件不直接使用」，并考虑在 `model.ts` 头注释补一句同义说明——否则下一轮 R2 还会把它们当死导出重新上报，且进度文件里会留下一条可被复查推翻的记述。

## 记录不修

- 上述两条理由校正建议属进度文件（P5/收尾台账）的措辞，不改代码；本轮无新增代码级问题。
- rev1/rev2 已记的 README 两处措辞（`:4`「不随主分支发布」、`:44`「临时展开」）仍在，属 P5 台账外既有保留项，不重复展开。

## 结论

- 需修复项：0（定向复核通过）——L3 已闭环；L1/L2 的「不修」处置同意，仅建议进度文件按上文措辞校正理由（L1 两处类比、L2 一条引用事实），不涉及代码改动。
