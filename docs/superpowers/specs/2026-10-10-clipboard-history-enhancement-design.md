# 剪贴板历史功能增强设计（类型扩展 + 弹窗查看器与编辑 + 复制缺陷根因修复 + 刷新实时性优化）

- 日期：2026-10-10
- 状态：待实施（设计已获用户批准，等待 spec 审阅）
- 影响工作区：`ai-digital-life/`
- 关联进度文件：`docs/root-cause-resolution/2026-10/progress-2026-10-10-012530.md`
- 关联技能：`brainstorming`（需求）+ `root-cause-resolution`（缺陷）

## 1. 背景与目标

「左侧边栏 - 剪贴板历史」当前只支持 `text`（CF_UNICODETEXT）与 `image`（CF_BITMAP）两种类型；「放大查看」弹窗为纯展示，无统计/缩放能力；并存在两个由**写回系统剪贴板**路径引入的缺陷。

本设计一次性完成三件事：**扩展剪贴板类型**、**增强放大查看弹窗（含编辑模式）**、**根因修复两个复制缺陷**。

### 目标

1. **类型扩展**：支持 `text`、`image`、`html`（HTML Format）、`rtf`（Rich Text Format）四种，尽量覆盖 Windows 主流剪贴板类型；富文本保留结构、可预览、可按原格式写回。
2. **修复缺陷 A（荧光色层）**：从历史复制图片后，粘贴得到的图片出现异常彩色高亮层，且颜色随重复次数变化。
3. **修复缺陷 B（追加式粘贴）**：先复制文本、再复制图片后粘贴，得到「文本 + 图片」混合内容。
4. **弹窗增强**：文本类条目支持字符统计、字号缩放、自动换行、复制、编辑、保存为文件；图片条目支持尺寸/格式/体积信息、缩放、复制、保存为文件。
5. **编辑模式**（仅 `text`）：可编辑内容，支持取消更改 / 撤回 / 重做 / 保存更改，绑定 Windows 快捷键；未点「保存更改」即关闭弹窗时**默认保存**，确保更改不丢失。
6. **默认字号调大**：文本弹窗默认字号偏小，需提升默认值。
7. **双端一致**：Tauri 桌面模式与浏览器模式功能行为一致。
8. **刷新实时性**：在别处复制后，剪贴板历史应**近乎即时**出现新条目（事件推送），不再依赖 2 s 轮询（见 §14）。

### 非目标

- 不支持「文件 / 文件夹」（CF_HDROP）类型（用户明确排除）。
- 不支持 CF_WAVE / CF_TIFF / CF_METAFILEPICT 等罕见格式。
- 不消除「从历史复制后历史中新增一行」的既有行为（用户明确接受）。
- 不引入旧数据迁移或向后兼容层（未发布阶段规则）：`ClipboardItem` 新增字段，旧行缺字段时按 `None` 处理，不写迁移代码。
- 不改变文本条目的既有「前端 `navigator.clipboard` 读系统剪贴板」能力，仅统一**写回**路径（见 §7）。

## 2. 术语

- **主类型（kind）**：一条剪贴板条目的最高保真可用格式，取值 `text | image | html | rtf`。驱动徽章、筛选、图标与写回分发。
- **纯文本载荷（content）**：条目的纯文本表示，用于搜索、列表预览、纯文本粘贴。HTML/RTF 条目同样填写。
- **富文本载荷**：HTML Format 或 RTF 的原始内容，落盘为 sidecar 文件（`html_path` / `rtf_path`）。
- **写回（write-back）**：把历史条目重新写入系统剪贴板（"再次复制"）。
- **拍摄式读取（capture）**：剪贴板监听触发时读取系统剪贴板并归一化入库。

## 3. 现状与根因

### 3.1 类型现状

`crates/clipboard/src/read.rs::read_current` 仅探测 `formats::Bitmap` 与 `formats::Unicode`，其余格式 `Ok(None)` 丢弃：

- 复制**文件/文件夹** → 不记录（用户已排除，不修）。
- 复制**网页富文本 / Word 富文本** → 通常附带纯文本，被"降级"为 `text` 入库，**格式结构丢失**。

### 3.2 缺陷 A 根因（荧光色层，颜色随重复次数变化）

1. `write_image_to_clipboard` 用 `image` crate 将 PNG 编码为 BMP。
2. `image` 0.25.10 的 BMP 编码器对 `Rgba8` 输出 **108 字节 BITMAPV4HEADER + `biCompression=3 (BI_BITFIELDS)` + 含 alpha 掩码的 BGRA32**（`image-0.25.10/src/codecs/bmp/encoder.rs:140-160,320-330`）。
3. `clipboard-win` 5.4.1 `raw::set_bitmap_inner` **只拷贝 40 字节 BITMAPINFOHEADER**，丢弃 V4 头其余部分；随后以 `BI_BITFIELDS` 调 `CreateDIBitmap`，而 `BI_BITFIELDS` 要求头部后紧跟颜色掩码——这些掩码落在**未初始化的栈内存**上被当作掩码读取（`clipboard-win-5.4.1/src/raw.rs:805-843`）。
4. 结果：颜色通道被错误掩码重映射 → 彩色叠加层；掩码源自栈垃圾 → **每次调用不同** → 颜色随复制次数变化。

### 3.3 缺陷 B 根因（追加式粘贴）

`clipboard-win` 5.4.1 `raw::set_bitmap` 显式使用 `options::NoClear::EMPTY_FN`（空操作），**不调用 `EmptyClipboard`**（源码注释称 bitmap 格式不会与其它格式重叠、为保持向后兼容，`raw.rs:787-792`；`options.rs`）。因此 `set_clipboard(formats::Bitmap, &bmp)` 只新增 CF_BITMAP，**先前残留的 CF_UNICODETEXT 等格式原样保留** → 目标处按多格式输出得到「文本 + 图片」。

### 3.4 弹窗现状

`ClipboardItemViewer.tsx` 仅渲染文本（`white-space: pre-wrap`）或图片（原图→缩略图→图标回退），无工具栏、无统计、无缩放、无编辑；文本默认字号 `var(--text-xs)`（12px），偏小。

## 4. 总体架构

```
系统剪贴板 ──[监听]──▶ capture(read_current) ──▶ ClipboardItem ──▶ SQLite(json) + sidecar 文件
                                                        │
                                    ┌───────────────────┴───────────────────┐
                                    ▼                                       ▼
                          剪贴板历史列表（行）                      放大查看弹窗（查看/编辑）
                                    │                                       │
                                    └──────────▶ write-back（统一后端）◀─────┘
                                                        │
                                            先 EmptyClipboard（治 B）
                                            再按 kind 写格式（治 A：24 位 BMP）
```

核心机制：

1. **单一写回入口**：所有类型的"再次复制"统一走后端 `clipboard.write(id)`，写入前一律 `EmptyClipboard`（根治 B），图片改用 24 位 BMP（根治 A）。
2. **一次复制 = 一行**：捕获时探测全部受支持格式，按优先级选主类型，共存的纯文本一并存入 `content`。
3. **纯文本内联、富文本落盘**：`content` 内联（可搜索）；HTML/RTF 载荷落盘为 sidecar 文件，与 `image_path` 同构，避免数据库膨胀。
4. **编辑 = 原地更新**：编辑保存更新同一 `id` 的 `content`，保持 `created_at`（时间线位置不变）。

## 5. 数据模型

### 5.1 `ClipboardItem`（`crates/types/src/types/clipboard.rs`）

| 字段 | 类型 | 变化 | 说明 |
|---|---|---|---|
| `id` | `String` | — | |
| `kind` | `String` | 取值扩为 `text \| image \| html \| rtf` | 主类型 |
| `content` | `Option<String>` | — | 纯文本表示（HTML/RTF 也填） |
| `digest` | `Option<String>` | — | 图片像素指纹；文本/HTML/RTF 为 `None` |
| `image_path` | `Option<String>` | — | 原图 PNG 路径 |
| `thumb_path` | `Option<String>` | — | 缩略图路径 |
| `image_width` / `image_height` | `Option<u32>` | — | |
| **`html_path`** | **`Option<String>`** | **新增** | HTML 载荷 sidecar 路径（`clipboard/html/<id>.html`） |
| **`rtf_path`** | **`Option<String>`** | **新增** | RTF 载荷 sidecar 路径（`clipboard/rtf/<id>.rtf`） |
| `source_app` | `Option<String>` | — | |
| `created_at` | `i64` | — | 列表排序键（`ORDER BY json_extract(json,'$.createdAt') DESC`） |

> 一条条目可同时持有 `content` + `html_path` + `rtf_path`（浏览器复制网页富文本时常见），`kind` 取优先级最高者。

### 5.2 目录布局（`ClipboardStore`）

在现有 `clipboard/images/`、`clipboard/thumbs/` 基础上新增：

- `clipboard/html/` — HTML 载荷
- `clipboard/rtf/` — RTF 载荷

`ClipboardStore::new` 一并 `create_dir_all`；`delete_files`、`clear`、去重顶替逻辑扩展到新目录（复用现有 `image_path`/`thumb_path` 的处理模式）。

### 5.3 富文本体积上限

新增常量 `MAX_RICH_PAYLOAD_BYTES`（默认 `1 MiB`）。超上限时不落盘富载荷：

- `html` 超限 → 丢弃 HTML，若纯文本非空降级为 `kind="text"`；纯文本也为空则不入库。
- `rtf` 同理。

## 6. 捕获管线（`read_current`）

### 6.1 格式探测与优先级

在打开剪贴板后依次探测：`Bitmap`、`Html`（`formats::Html::new()` 注册 "HTML Format"）、`Rich Text Format`（`register_format("Rich Text Format")` → `RawData`）、`Unicode`。

**主类型优先级：`image > html > rtf > text`**。

| 用户操作 | 剪贴板实际格式 | 结果主类型 |
|---|---|---|
| 网页选中文字复制 | CF_UNICODETEXT + HTML Format | `html`（`content`=纯文本，`html_path`=HTML） |
| 网页右键"复制图片" | CF_BITMAP（+ 可能 HTML） | `image` |
| Word/WPS 复制带格式文字 | CF_UNICODETEXT + RTF（+ 可能 HTML） | `html` 或 `rtf` |
| 纯文本编辑器复制 | CF_UNICODETEXT | `text` |

### 6.2 组装规则

1. 读 `Bitmap` → 走既有 `build_image_item`（PNG + 缩略图 + 指纹）。
2. 读 `Html` → 去 CF_HTML 头后的 HTML 片段，写入 `html/<id>.html`，设 `html_path`。
3. 读 RTF → 原始字节写入 `rtf/<id>.rtf`，设 `rtf_path`。
4. 读 `Unicode` → 归一化后作 `content`。
5. 依据实际存在的载荷与优先级确定 `kind`；`content` 为空且无图片/富载荷时返回 `Ok(None)`（不入库）。

### 6.3 去重

- 图片：维持 `digest`（像素指纹）比较。
- 文本/HTML/RTF：比较 `content`；**富文本载荷不参与比较**（同一文本不同来源视为同一内容），保持既有 `prev.kind == item.kind` 守卫。

## 7. 写回路径（统一后端，根治缺陷 A、B）

### 7.1 新 IPC：`clipboard.write(id)`

取代面向前端的 `writeImage`。后端按 `kind` 分发，**统一流程**：

```
Clipboard::new_attempts(10)      // 打开剪贴板（Windows 独占）
  ├─ empty()                      // ← 根治缺陷 B：写前清空所有旧格式
  ├─ 按 kind 写载荷（可多格式）
  └─ drop(clipboard)              // 关闭
```

各类型写入：

| kind | 写入格式 | 实现 |
|---|---|---|
| `text` | CF_UNICODETEXT | `set(formats::Unicode, &content)` |
| `html` | HTML Format + CF_UNICODETEXT | `Html::new()` setter 写 HTML；同时写纯文本 |
| `rtf` | Rich Text Format + CF_UNICODETEXT | `RawData(register_format("Rich Text Format"))` 写 RTF；同时写纯文本 |
| `image` | CF_BITMAP | 24 位 BMP（见 §7.2） |

> 同时写纯文本，保证只认纯文本的目标（如终端、输入框）也能粘贴。

### 7.2 图片：24 位 BI_RGB BMP（根治缺陷 A）

`write_image_to_clipboard` 改为：

1. 读取落盘 PNG。
2. **转为 `Rgb8`**（丢弃 alpha；透明像素合成到白色背景，避免透明区域变黑）。
3. 编码为 BMP —— `image` crate 对 `Rgb8` 输出 **40 字节 BITMAPINFOHEADER + `biCompression=0 (BI_RGB)` + 24bpp**，`set_bitmap_inner` 的 40 字节头拷贝**恰好完整**，不再触发 BI_BITFIELDS 掩码读取。
4. 通过统一写回流程（先 `empty()`）`set(formats::Bitmap, &bmp)`。

> 备选（不采用）：自建 DIB 结构体 + `CreateDIBitmap`。需自行管理掩码与内存，复杂度高且无必要，故不采用。

### 7.3 前端

剪贴板历史条目的复制统一走 `CopyButton` 的 `onCopy` 路径 → `writeClipboardItem(id)`（store action → `clipboard.write`），四种 kind 一视同仁，不再区分文本/富媒体。

> 影响面仅限剪贴板历史：`CopyButton` 供其它功能使用的 `text` 属性路径（`navigator.clipboard.writeText`）**保持不变**，不在本次改动范围内。

## 8. 放大查看弹窗

### 8.1 布局

- **头部**：主类型标签 + 工具栏 + 关闭按钮。
- **主体**：文本类（`text`/`html`/`rtf`）→ 文本区（可切换富文本预览）；`image` → 图片区（可缩放）。

### 8.2 工具栏

| 条目类型 | 工具 |
|---|---|
| `text` | 字符统计 · 字号缩放（`A-` `A+` `重置`） · 自动换行开关 · 复制 · **编辑** · 保存为文件 |
| `html` / `rtf` | 字符统计（基于纯文本） · 字号缩放 · 自动换行开关 · 复制 · **预览富文本**（仅 html） · 保存为文件 |
| `image` | 尺寸（`宽×高`）· 格式 · 体积 · 缩放（`-` `+` `适应窗口`） · 复制 · 保存为文件 |

> 「编辑」仅出现在 `text` 条目（见 §8.4）。

- **字符统计**：字符数 · 不含空格字符数 · 行数（常驻显示，随内容/编辑实时更新）。对中文语义明确，不提供易误导的"词数"。
- **字号缩放**：步进 10%，范围 50%–400%，`重置`回 100%（默认 100% = 14px，见 §8.5）。
- **自动换行开关**：`pre-wrap`（默认，换行）↔ `pre`（横向滚动）。
- **图片缩放**：以显示宽度 = 原宽 × 比例实现，范围 25%–400%，`适应窗口`回到 100%（`max-width:100%`）。
- **保存为文件**：
  - `text` → `.txt`；`html` → `.html`；`rtf` → `.rtf`；`image` → `.png`。
  - 双端策略：Tauri 模式调用后端 `clipboard.export(id)`（原生保存对话框选路径后落盘）；浏览器模式由前端以 Blob + `a[download]` 下载。两者对外行为一致（"另存为文件"）。

### 8.3 富文本预览（安全）

- 默认显示**纯文本**（`content`）。
- 提供「预览富文本」切换：以 `sandbox=""`（禁用脚本、禁同源）的 `<iframe srcdoc={html}>` 渲染 HTML；RTF 无标准化浏览器渲染，仅提供复制与纯文本查看（不承诺 RTF 预览）。
- 不使用外部 URL iframe 的 `checkEmbed` 预检链（此处为无网络的 srcdoc 沙箱，非跨域嵌入）。

### 8.4 编辑模式（仅 `text`）

- 点击「编辑」进入编辑模式：文本区变为可编辑区（`textarea`，与原文本样式一致）。
- **撤销栈**：自建轻量快照栈（每次输入变更压栈，含入口快照），指针式撤销/重做；按钮与快捷键共用同一实现，便于单测。

| 动作 | 快捷键 | 行为 |
|---|---|---|
| 撤回 | `Ctrl+Z` | 回退一步编辑 |
| 重做 | `Ctrl+Y` | 前进一步编辑 |
| 保存更改 | `Ctrl+S` | 落库（原地更新），退出编辑模式，**弹窗不关** |
| 取消更改 | `Esc` | 还原到进入编辑时的内容，退出编辑模式，**弹窗不关** |

- **关闭即保存**：编辑模式下点击 `X` 或遮罩关闭时，若存在未保存更改，**先保存再关闭**。非编辑模式下 `Esc`/`X`/遮罩仍为普通关闭。
- **特殊情况兜底**：组件卸载（编辑中）时若存在未保存更改，同样触发保存，确保更改不丢失。
- 内容为空时禁用「保存更改」。
- HTML/RTF 条目**不开放编辑**（按用户要求仅 `text`）。

### 8.5 默认字号

- `.adl-clipboard-viewer__text` 的 `font-size` 从 `var(--text-xs)`（12px）提升为 **`var(--text-sm)`（14px）**，作为缩放 100% 基准（`line-height` 保持 1.6）。
- 缩放实现：基准字号 × 缩放比例（`style={{ fontSize: 'calc(var(--text-sm) * <ratio>)' }}`）。

## 9. IPC 与双端一致性改动清单

### 9.1 后端（Rust）

| 位置 | 改动 |
|---|---|
| `crates/types/src/types/clipboard.rs` | `ClipboardItem` 增 `html_path` / `rtf_path` |
| `crates/clipboard/src/read.rs` | 格式探测与优先级；HTML/RTF 落盘；**图片写回改 24 位 BMP**；新增统一写回 helper（`empty()` + 按 kind 写） |
| `crates/clipboard/src/store.rs` | `html/`、`rtf/` 目录；`delete_files` / `clear` / 去重顶替扩展 |
| `crates/clipboard/src/lib.rs` | 导出新写回 API |
| `crates/kernel/src/events.rs` | `AppEvent::ClipboardChanged` 改为无负载变体并接通（见 §14） |
| `crates/server/src/engine.rs` | 监听广播 → `EventBus` 事件桥（见 §14） |
| `crates/server/src/ws_workspace.rs` | 新增 `clipboard-changed` 帧转发（见 §14） |
| `crates/server/src/router.rs` | 新路由 `POST /clipboard/write`、`POST /clipboard/update`、`GET /clipboard/html/:filename`、`GET /clipboard/rtf/:filename`、`POST /clipboard/export` |
| `crates/server/src/handlers/clipboard.rs` | 实现上述 handler；**移除** `write-image` 路由与 `write_image` handler（由 `write` 取代） |

### 9.2 前端（TypeScript）

| 位置 | 改动 |
|---|---|
| `shared/ipc/clipboard.ts` | 接口新增 `write` / `update` / `export` / `getHtmlUrl` / `getRtfUrl`（移除 `writeImage`） |
| `httpBridge.ts` | 同步实现新接口 |
| `preview-bridge/index.ts` | 同步实现（浏览器预览） |
| `mock-bridge.ts` / `mock/mock-clipboard.ts` | 同步 mock |
| `stores/actions/utilitiesActions.ts` | `writeClipboardItem` 改调 `clipboard.write`；新增 `updateClipboardItem`、`exportClipboardItem` |
| `stores/slices/clipboardHistorySlice.ts` | 新增就地更新 action |
| `features/clipboard-history/clipboardKind.ts` | 增 `html` / `rtf` 标签映射 |
| `features/clipboard-history/clipboardFilter.ts` | `KIND_ORDER` 增 `html` / `rtf` |
| `features/clipboard-history/ClipboardItemRow.tsx` | 图片/富文本徽章与预览；复制统一走 `write` |
| `features/clipboard-history/ClipboardItemViewer.tsx` | 工具栏、统计、缩放、换行、预览切换、编辑模式、保存为文件、默认字号 |
| `features/clipboard-history/ClipboardHistoryList.tsx` | `clipboard.onChanged` 即时刷新 + 轮询降级兜底（见 §14） |
| `shared/ipc/workspace-events-ws.ts` | 新增 `onClipboardChanged`，按 `kind` 分派帧（见 §14） |
| `i18n/zh-CN/utilities.ts`（及对应 en） | 新增所有文案 key（禁止硬编码） |

> 遵循项目规则：新增 IPC 必须同步 `tauri-bridge`（继承 http）/ `preview-bridge` / `mock-bridge`。所有 UI 文案走 i18n。

## 10. 存储与生命周期

- **去重顶替**：合并时删除旧条目的 `image_path`/`thumb_path`/`html_path`/`rtf_path`，避免孤儿文件。
- **删除单条 / 清空**：`remove` / `clear` 删除全部关联文件（含新目录）。
- **编辑保存**：`save_entity` 原地覆盖，`created_at` 不变 → 列表位置不变。

## 11. 测试计划（分级执行）

| 层 | 用例 |
|---|---|
| Rust `adl-clipboard` | 格式优先级（image>html>rtf>text）；超限降级；`Rgb8` BMP 编码为 40 字节头 + `BI_RGB`；sidecar 落盘与删除；去重顶替清理新目录 |
| Rust `adl-server` | `/clipboard/write`（各 kind）、`/clipboard/update`、`/clipboard/asset/*`、`/clipboard/export` 的成功/边界/404 |
| 前端 vitest | `clipboardKind` 标签；`clipboardFilter` 计数顺序；查看器统计/缩放/换行；编辑模式（撤销栈、保存、取消、关闭即保存）；`CopyButton` 走 `write` |
| 收尾 | `mandatory-testing`：ESLint / Prettier / Clippy / rustfmt + 类型检查 + 受影响测试 |

> 遵循全局测试策略：所有阶段只跑受影响部分，不跑全量。

## 12. 风险与注意事项

1. **剪贴板独占**：Windows 剪贴板同时只允许一个持有者；统一写回需保证 `empty()` 与 `set()` 在同一打开会话内完成，且 `Clipboard` 实例及时 `drop`。写回失败需通过既有错误提示呈现。
2. **透明图片**：转 `Rgb8` 会丢弃 alpha；透明区合成白底，避免变黑，但**半透明像素会被压成不透明**。这是 CF_BITMAP 无 alpha 的固有限制；如需保留透明应改用 CF_DIBV5（本设计不采用，YAGNI）。
3. **富文本体积**：HTML 可能极大，靠 `MAX_RICH_PAYLOAD_BYTES` 上限兜底；超限降级行为需在 spec 明确并测试。
4. **安全**：富文本预览必须用 `sandbox=""` iframe，禁止直接 `innerHTML` 渲染剪贴板 HTML。
5. **写回触发监听**：写回图片/富文本会触发监听器回读并可能新增一行（用户已接受）；修复编码后同一图片往返指纹一致，若为最新条目则会被去重顶替。
6. **保存为文件**：Tauri 原生对话框与浏览器下载行为需保持一致的用户可感知结果；导出失败需提示。
7. **编辑兜底保存**：所有关闭路径（`X` / 遮罩 / 触发关闭的快捷键）在编辑模式下统一"先 `await` 落库、再关闭"，组件卸载亦先完成保存，避免"保存未完成即销毁"导致更改丢失。
8. **推送链路可用性**：`/ws/workspace` 不可用（引擎未起、断线）时，剪贴板历史退化为 10 s 轮询兜底，功能不缺失但实时性下降；重连后主动补刷一次。
9. **事件密集**：连续快速复制会触发密集事件，前端以 ~100 ms 节流合并为一次重拉，避免 IPC 抖动。

## 13. 实施批次建议

| 批次 | 内容 |
|---|---|
| A | 缺陷修复：统一写回路径 + `EmptyClipboard` + 图片 24 位 BMP（含 Rust 测试） |
| B | 类型扩展：数据模型 + 捕获管线 + sidecar 存储 + IPC + 前端 kind/筛选/预览 |
| C | 弹窗查看器：统计 / 缩放 / 自动换行 / 保存为文件 / 默认字号 |
| D | 编辑模式：撤销栈 + 快捷键 + 关闭即保存 + `clipboard.update` IPC + 测试 |
| E | 刷新实时性：事件推送（`ClipboardChanged` → `/ws/workspace` → 前端即时刷新）+ 轮询降级兜底（见 §14） |

## 14. 刷新实时性优化（事件推送，批次 E）

### 14.1 问题与根因

在系统其它应用复制内容后，剪贴板历史需要一段时间才出现新条目。

**根因（已确证）：剪贴板历史没有任何推送，仅靠前端固定轮询。**

- `ClipboardHistoryList.tsx` 以 `REFRESH_INTERVAL_MS = 2000` 固定 2 s 轮询 `fetchClipboardHistory(true)`，最坏约 2 s 才可见，Tauri 与浏览器模式同样如此。
- **更严重**：应用窗口失焦 / 被遮挡时，Chromium / WebView2 会对 `setInterval` 做后台节流，实际延迟可被拉长到数秒甚至更久，表现为"时快时慢"。
- 推送能力**已存在但未接线**：`ClipboardMonitor` 变化时已通过 `broadcast` 广播（`crates/clipboard/src/monitor.rs:76-91`），但 `crates/server/src/engine.rs:251` 仅 `spawn` 监听、**无任何订阅者**；`AppEvent::ClipboardChanged`（`crates/kernel/src/events.rs:52`）**定义但从未 emit**。
- 推送通道**已现成**：`/ws/workspace` WebSocket（`crates/server/src/ws_workspace.rs`）已在为工作区文件变更推送 `AppEvent::FilesChanged`，前端有共享客户端 `frontend/src/shared/ipc/workspace-events-ws.ts`。

### 14.2 方案：补全事件链路（复用现有 WS 通道）

```
ClipboardMonitor(broadcast) ──▶ engine 事件桥 ──▶ AppEvent::ClipboardChanged
        └─▶ EventBus ──▶ /ws/workspace 推 {kind:"clipboard-changed"}
                                   └─▶ 前端共享 WS 客户端 ──▶ 列表立即重拉
```

| 位置 | 改动 |
|---|---|
| `crates/kernel/src/events.rs` | `ClipboardChanged(String)` → **无负载单元变体 `ClipboardChanged`**（无消费者依赖其 `String`）；同步更新 `kind()` 与 `to_json()` 分支 |
| `crates/server/src/engine.rs` | `start_background_services`：先 `monitor.subscribe()` 取得接收端，再 `spawn` 监听；新增事件桥把收到的信号 `state.event_bus.emit(AppEvent::ClipboardChanged)`（`EventBus` 为 `Clone`，桥运行在独立线程） |
| `crates/server/src/ws_workspace.rs` | 新增 `clipboard_changed_frame() -> {"kind":"clipboard-changed"}`（形状由单测锁定，与 `files_changed_frame` 同构）；forwarder 增加 `AppEvent::ClipboardChanged` 分支推该帧 |
| `frontend/src/shared/ipc/workspace-events-ws.ts` | 客户端新增 `onClipboardChanged(listener)`；`handleFrame` 按 `kind` 分派（`files-changed` / `clipboard-changed`）；重连成功时同样通知剪贴板订阅者（补断线窗口） |
| `frontend/src/shared/ipc/clipboard.ts` | `ClipboardBridge` 新增 `onChanged(listener: () => void): () => void` |
| `frontend/src/httpBridge.ts` | `clipboard.onChanged` 接到共享 `getWorkspaceEvents()` 客户端 |
| `frontend/src/preview-bridge/index.ts` | `clipboard.onChanged` **恒走 http 实现**（与 `getThumbUrl` 同理：纯本地订阅，mock 无意义） |
| `frontend/src/mock-bridge.ts` / `mock/mock-clipboard.ts` | `onChanged: () => () => {}`（空订阅，满足桥接契约） |
| `frontend/src/app/features/clipboard-history/ClipboardHistoryList.tsx` | 订阅 `clipboard.onChanged` → 立即 `fetchClipboardHistory(true)`（**节流 ~100 ms** 合并密集事件）；轮询间隔 `2000 → 10000 ms` 降级为断线兜底；保留 `visibilitychange` 处理 |

### 14.3 设计要点

- **双端一致**：Tauri 与浏览器模式都经同一 `/ws/workspace` 通道，行为天然一致（实现相同）。
- **降级安全**：WS 不可用时轮询（10 s）仍能兜底；重连后主动补一次刷新。
- **事件语义**：帧不带 id（仅"有变更"信号），前端整体重拉列表——与现有 `files-changed` 的消费模式一致，避免增量同步复杂度。
- **路由命名**：保持 `/ws/workspace` 路径不变，仅扩展帧类型；更新相关文档注释说明该通道已承载多域事件（不做无收益的路径重命名）。
- **`EventBus` 为 `broadcast`**：桥接循环对 `Lagged`/`Closed` 做与 `ws_workspace` 相同的收敛处理。

### 14.4 测试

| 层 | 用例 |
|---|---|
| Rust `adl-server` | `clipboard_changed_frame` 形状锁定；forwarder 对 `ClipboardChanged` 产出该帧 |
| 前端 vitest | WS 客户端按 `kind` 分派 `clipboard-changed`；重连通知剪贴板订阅者；`ClipboardHistoryList` 在 `onChanged` 触发时立即重拉；桥接契约含 `onChanged` |
