## 范围

- 定向复核（只核 rev4 R1 的文案 low，不做全量重审）：按提示直接读工作区源码，未生成/未使用新快照。
- 读取点：`adlo/frontend/prototype/README.md:27`、`adlo/frontend/prototype/src/DndPrototype.tsx:76-79`（`VARIANT_META.D`，渲染于 `DndPrototype.tsx:1280` 的 inspector 描述）、对照 `adlo/frontend/prototype/src/prototype.css:494-535`。
- 本轮只可能涉及文案，无代码/CSS 变更，故用静态读码 + 全目录关键词枚举，未起 dev server、未跑任何测试。

## 定向核对结果

- **文案已改，且与 CSS 逐项对应**：
  - `README.md:27` → 「D 幽灵占位｜采用 A 的分区｜排序：覆盖式幽灵行（不透明） / 放入：虚线幽灵子行（半透明）」
  - `DndPrototype.tsx:78` → 「采用 A 的分区；排序时显示覆盖式幽灵行（不透明），放入时显示虚线幽灵子行（半透明）。」（页面右侧 inspector 直接显示该字符串，`DndPrototype.tsx:1280`）
  - 对应实现：排序幽灵 `.proto-row-slot > .proto-ghost-row`（`prototype.css:512-524`）为 `position: absolute; top: 0; left/right: 0; height: 100%; z-index: 3; background: var(--bg-card); opacity: 1` → 与「覆盖式 / 不透明」一致；放入子幽灵 `.proto-ghost-row--child`（`prototype.css:533-535`）`opacity: 0.7`，叠加基类 `.proto-ghost-row`（`prototype.css:501-507`）的 `border: 1px dashed var(--accent)` + `background: var(--accent-subtle)` → 与「虚线 / 半透明」一致。D 行「采用 A 的分区」仍与 `DndPrototype.tsx:522` 的 `rect.height * 0.2` 相符。
- **本 scope 内无「半透明占位行」残留指向排序幽灵**：全目录枚举 `半透明` 共 5 处，逐条确认——
  - `README.md:27` / `DndPrototype.tsx:78`：新文案，只形容放入子幽灵（正确）；
  - `README.md:80`、`ghost/ghost.css:62`、`ghost/GhostPrototype.tsx:31`：抬升副本 C 变体（玻璃模糊），与排序幽灵无关（正确）。
  - 另：`grep 半透明占位` 在 `adlo/frontend/prototype/` 下零命中。

## 跨 scope 观察（不计入本 scope 需修复项，供主代理转写）

- 本 scope 之外仍有两处旧表述指向「排序幽灵半透明」，且均已在进度文件 P5「待修」清单登记（`docs/root-cause-to-close/2026-11/progress-2026-11-16-105349.md:152-153`），无需重复登记：
  - `GLOSSARY.md:432`（`投放指示` 定义：「…排序插入线、放入高亮、禁止态与半透明占位行」）→ 对应 P5「`GLOSSARY.md`：`投放指示` 定义去掉'半透明占位行'」。
  - `docs/superpowers/specs/2026-11-16-browser-panel-dnd-design.md:31`（「排序插入时显示半透明占位行」）与 `:64`（「2px accent 插入线 + 半透明幽灵行」）→ 对应 P5「删除 toast / accent / 幽灵占位行描述」。

## 记录不修

- `prototype.css:506` 基类 `.proto-ghost-row` 的 `opacity: 0.92` 现被两处使用点全覆盖（slot 覆盖态 → 1，`--child` → 0.7），实际不可达；属无害默认值，下次动这块样式时顺手删掉即可。
- `prototype.css:121-125` 图例色块 `.proto-legend__swatch--ghost` 仍按旧观感（`--accent-subtle` + `opacity: .75`）绘制；图例只是示意，不表达排序/放入两种幽灵的区别，未处理。
- rev1/rev2/rev3 已记的不修项（README:4「当前工作分支」措辞、README:44「临时展开」、原型 HTML 不读 `?theme=`、favicon 404、A/B/C/D 落点仍用 `--accent` 系、D 末端带用普通插入线、覆盖态底色 `--bg-card` 与 `--top` 行 `--surface` 的轻微色差）本轮无变化，不重复展开。

## 结论

- 需修复项：0（定向复核通过）
