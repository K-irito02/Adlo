# 剪贴板历史功能增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把左侧边栏「剪贴板历史」从「文本/图片两类 + 纯展示弹窗 + 2 s 轮询」升级为「文本/图片/HTML/RTF 四类 + 可统计/缩放/编辑的查看器 + 事件推送实时刷新」，并根因修复图片写回的两处缺陷。

**Architecture:** 捕获侧扩展格式探测并按 `image > html > rtf > text` 选主类型，富文本载荷落盘 sidecar；写回侧收敛为**单一后端入口**（打开剪贴板 → `EmptyClipboard` → 按 kind 写多格式），图片改 24 位 BI_RGB BMP；刷新侧把剪贴板监听接到既有 `/ws/workspace` WebSocket 推送，轮询降级为兜底。

**Tech Stack:** Rust（`clipboard-win` 5.4、`image` 0.25、axum、tokio、rusqlite/r2d2、ts_rs）、TypeScript（React 18、Zustand、vitest、WebSocket）。

**Spec:** `docs/superpowers/specs/2026-10-10-clipboard-history-enhancement-design.md`

## Global Constraints

- 工作区：所有源码在 `ai-digital-life/`；文档写入**仓库根** `docs/`（禁止 `ai-digital-life/docs/`）。
- 禁止在 capability 文件中使用 `"all"` / `"**"` 通配权限。
- 功能必须 **Tauri 桌面模式与浏览器模式行为一致**；新增 IPC 必须同步实现 `tauri-bridge.ts`（`...http` 继承）/ `preview-bridge/index.ts` / `mock-bridge.ts`。
- 任何 UI 展示文本（按钮/Tooltip/aria-label/占位符）**禁止硬编码**，必须走 i18n key。
- 未发布阶段**禁止**添加数据格式兼容或旧版本迁移代码；旧行缺字段按 `None` 处理。
- 禁止「向后兼容」式重导出或仅为旧导入路径保留的兼容层。
- 未经用户允许禁止使用蓝色系（`var(--accent)`）作为提示/警醒色。
- 调试日志（`console.log`/`[ADL-DEBUG]`）不得遗留生产代码。
- 测试**分级执行**：只跑受影响部分，不跑全量。Rust 命令在 `ai-digital-life/` 下执行；前端命令在 `ai-digital-life/frontend/` 下执行。
- Commit 遵循 Conventional Commit：`type(scope): summary`；分支名 kebab-case、≤3 词、无斜杠。
- 每个任务结束前必须保持 `cargo clippy -p <crate>` 与 `tsc --noEmit` 通过。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `crates/types/src/types/clipboard.rs` | `ClipboardItem` 数据结构 | 改 |
| `frontend/src/kernel/types.ts` | TS 侧 `ClipboardItem`（手写） | 改 |
| `crates/clipboard/src/read.rs` | 捕获（探测/优先级/落盘）+ 写回入口 | 改 |
| `crates/clipboard/src/image.rs` | 图片落盘工具 | 改 |
| `crates/clipboard/src/store.rs` | 目录/清理/去重 | 改 |
| `crates/clipboard/src/lib.rs` | 对外导出 | 改 |
| `crates/server/src/handlers/clipboard.rs` | HTTP handler | 改 |
| `crates/server/src/router.rs` | 路由表 | 改 |
| `crates/server/src/engine.rs` | 监听 → 事件桥 | 改 |
| `crates/server/src/ws_workspace.rs` | WS 帧转发 | 改 |
| `crates/kernel/src/events.rs` | `AppEvent::ClipboardChanged` | 改 |
| `frontend/src/shared/ipc/clipboard.ts` | `ClipboardBridge` 契约 | 改 |
| `frontend/src/httpBridge.ts` | http 实现 | 改 |
| `frontend/src/preview-bridge/index.ts` | 预览桥接 | 改 |
| `frontend/src/mock-bridge.ts` / `mock/mock-clipboard.ts` | mock | 改 |
| `frontend/src/shared/ipc/workspace-events-ws.ts` | WS 客户端（多 kind 分派） | 改 |
| `frontend/src/app/stores/actions/utilitiesActions.ts` | store action | 改 |
| `frontend/src/app/stores/slices/clipboardHistorySlice.ts` | 就地更新 action | 改 |
| `frontend/src/app/features/clipboard-history/*` | 列表 / 行 / 查看器 / kind / filter | 改 |
| `frontend/src/app/i18n/{zh-CN,en-US}/utilities.ts` | 文案 | 改 |

---

## Task 1: 数据模型扩展（`html_path` / `rtf_path`）

**Files:**
- Modify: `crates/types/src/types/clipboard.rs`
- Modify: `frontend/src/kernel/types.ts:438-450`
- Test: `crates/types/src/types/clipboard.rs`（文件内 `#[cfg(test)]`）

**Interfaces:**
- Consumes: 无
- Produces: `ClipboardItem { id, kind, content, digest, image_path, thumb_path, image_width, image_height, html_path, rtf_path, source_app, created_at }`（Rust 字段 snake_case；TS 侧 camelCase `htmlPath` / `rtfPath`）

- [ ] **Step 1: 写失败测试（新增字段的序列化往返 + 缺字段容错）**

在 `crates/types/src/types/clipboard.rs` 末尾追加：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn richtext_paths_round_trip_and_default_to_none() {
        // 旧行 JSON 不含新字段 → 必须反序列化为 None（未发布阶段不做迁移）
        let legacy = r#"{
            "id":"a","kind":"text","content":"hi","digest":null,
            "imagePath":null,"thumbPath":null,"imageWidth":null,"imageHeight":null,
            "sourceApp":null,"createdAt":1
        }"#;
        let item: ClipboardItem = serde_json::from_str(legacy).unwrap();
        assert_eq!(item.html_path, None);
        assert_eq!(item.rtf_path, None);

        // 新字段可往返
        let mut it = item.clone();
        it.html_path = Some("/x/a.html".into());
        it.rtf_path = Some("/x/a.rtf".into());
        let json = serde_json::to_string(&it).unwrap();
        let back: ClipboardItem = serde_json::from_str(&json).unwrap();
        assert_eq!(back.html_path.as_deref(), Some("/x/a.html"));
        assert_eq!(back.rtf_path.as_deref(), Some("/x/a.rtf"));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-types richtext_paths -- --nocapture`
Expected: 编译失败 —— `no field html_path on type ClipboardItem`。

- [ ] **Step 3: 最小实现**

`crates/types/src/types/clipboard.rs` 的 struct 中，在 `image_height` 之后插入：

```rust
    /// HTML Format 载荷的 sidecar 文件路径（`clipboard/html/<id>.html`）
    pub html_path: Option<String>,
    /// Rich Text Format 载荷的 sidecar 文件路径（`clipboard/rtf/<id>.rtf`）
    pub rtf_path: Option<String>,
```

`frontend/src/kernel/types.ts` 的 `ClipboardItem` 中，在 `imageHeight?: number;` 之后插入：

```ts
  /** 富文本 HTML 载荷的 sidecar 文件路径 */
  htmlPath?: string;
  /** 富文本 RTF 载荷的 sidecar 文件路径 */
  rtfPath?: string;
```

- [ ] **Step 4: 补齐所有构造点并运行测试**

Run: `cd ai-digital-life && cargo test -p adl-types richtext_paths`
Expected: PASS。

随后修复编译报错的**全部** `ClipboardItem { .. }` 构造点（`crates/clipboard/src/read.rs` 的 `build_text_item` / `build_image_item`、`crates/clipboard/src/store.rs` 与 `crates/server/src/handlers/clipboard.rs` 的测试辅助函数），一律补 `html_path: None, rtf_path: None,`。

Run: `cd ai-digital-life && cargo build -p adl-clipboard -p adl-server`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/types/src/types/clipboard.rs ai-digital-life/frontend/src/kernel/types.ts ai-digital-life/crates/clipboard/src ai-digital-life/crates/server/src/handlers/clipboard.rs
git commit -m "feat(clipboard): add html/rtf sidecar path fields to ClipboardItem"
```

---

## Task 2: 图片写回改 24 位 BI_RGB BMP（缺陷 A）

**Files:**
- Modify: `crates/clipboard/src/read.rs`（`write_image_to_clipboard`）
- Test: `crates/clipboard/src/read.rs`（文件内 `#[cfg(test)]`）

**Interfaces:**
- Consumes: 无
- Produces: `pub(crate) fn png_to_bmp24(path: &Path) -> Result<Vec<u8>, AppError>` —— 返回 **40 字节 BITMAPINFOHEADER + `biCompression=0` + 24 bpp** 的 BMP 文件字节

**背景：** `image` 0.25 对 `Rgba8` 输出 108 字节 V4 头 + `BI_BITFIELDS`；`clipboard-win` 的 `set_bitmap_inner` 只拷贝 40 字节头，颜色掩码会落到未初始化栈内存上被误读。转为 `Rgb8` 可让编码器输出经典 40 字节头 + `BI_RGB`。

- [ ] **Step 1: 写失败测试**

在 `crates/clipboard/src/read.rs` 的 `mod tests` 内追加：

```rust
    #[test]
    fn png_to_bmp24_is_classic_24bit_birgb() {
        let path = std::env::temp_dir().join("clip-bmp24-src.png");
        let mut img = image::RgbaImage::new(3, 2);
        img.put_pixel(0, 0, image::Rgba([255, 0, 0, 128])); // 半透明红 → 应合成到白底
        img.put_pixel(1, 0, image::Rgba([0, 255, 0, 0])); // 全透明 → 白底
        img.save(&path).unwrap();

        let bmp = png_to_bmp24(&path).expect("encode ok");
        assert_eq!(&bmp[0..2], b"BM");
        let dib = 14usize;
        let bi_size = u32::from_le_bytes(bmp[dib..dib + 4].try_into().unwrap());
        assert_eq!(bi_size, 40, "必须是经典 BITMAPINFOHEADER（40 字节）");
        let bit_count = u16::from_le_bytes(bmp[dib + 14..dib + 16].try_into().unwrap());
        assert_eq!(bit_count, 24, "必须 24bpp");
        let compression = u32::from_le_bytes(bmp[dib + 16..dib + 20].try_into().unwrap());
        assert_eq!(compression, 0, "必须 BI_RGB（不得为 BI_BITFIELDS=3）");

        let _ = std::fs::remove_file(&path);
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-clipboard png_to_bmp24 -- --nocapture`
Expected: 编译失败 —— `cannot find function png_to_bmp24`。

- [ ] **Step 3: 最小实现**

在 `crates/clipboard/src/read.rs` 中，`write_image_to_clipboard` 之前插入：

```rust
/// 把落盘 PNG 编码为 **经典 24 位 BI_RGB BMP**。
///
/// `image` 0.25 的 BMP 编码器对 `Rgba8` 会输出 108 字节 BITMAPV4HEADER + `biCompression=3
/// (BI_BITFIELDS)`；而 `clipboard-win` 的 `raw::set_bitmap_inner` 只拷贝 **40 字节**
/// BITMAPINFOHEADER，颜色掩码会落到未初始化内存上被误读 → 粘贴出现随机彩色叠加层（缺陷 A）。
/// 转 `Rgb8` 后编码器改用 40 字节头 + `BI_RGB`，与 `set_bitmap_inner` 的假设一致。
/// alpha 无法在 CF_BITMAP 中保留，故透明像素合成到白底（避免透明区变黑）。
pub(crate) fn png_to_bmp24(path: &Path) -> Result<Vec<u8>, AppError> {
    let img = image::open(path).map_err(|e| AppError::Io(format!("image open: {e}")))?;
    let rgba = img.to_rgba8();
    let (width, height) = (rgba.width(), rgba.height());
    let mut rgb = image::RgbImage::new(width, height);
    for (x, y, px) in rgba.enumerate_pixels() {
        let a = u32::from(px.0[3]);
        let over_white = |c: u8| ((u32::from(c) * a + 255 * (255 - a)) / 255) as u8;
        rgb.put_pixel(x, y, image::Rgb([over_white(px.0[0]), over_white(px.0[1]), over_white(px.0[2])]));
    }
    let mut bmp: Vec<u8> = Vec::new();
    image::DynamicImage::ImageRgb8(rgb)
        .write_to(&mut Cursor::new(&mut bmp), image::ImageFormat::Bmp)
        .map_err(|e| AppError::Io(format!("bmp encode: {e}")))?;
    Ok(bmp)
}
```

- [ ] **Step 4: 切换调用点并运行测试**

把 `write_image_to_clipboard` 函数体替换为：

```rust
pub fn write_image_to_clipboard(path: &Path) -> Result<(), AppError> {
    let bmp = png_to_bmp24(path)?;
    set_clipboard(formats::Bitmap, &bmp)
        .map_err(|e| AppError::Io(format!("clipboard write: {e}")))?;
    Ok(())
}
```

Run: `cd ai-digital-life && cargo test -p adl-clipboard`
Expected: PASS（含既有 `bitmap_to_rgba_*`、`write_image_via_build_image_item_persists_png` 等）。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/clipboard/src/read.rs
git commit -m "fix(clipboard): encode write-back image as 24-bit BI_RGB BMP"
```

---

## Task 3: 统一写回（`EmptyClipboard` + 多格式，缺陷 B）

**Files:**
- Create: `crates/clipboard/src/write.rs`
- Modify: `crates/clipboard/src/lib.rs`
- Test: `crates/clipboard/src/write.rs`（文件内 `#[cfg(test)]`）

**Interfaces:**
- Consumes: Task 2 的 `png_to_bmp24`；Task 1 的 `ClipboardItem.html_path` / `rtf_path`
- Produces:
  - `pub enum FormatWrite { Unicode(String), Html(String), Rtf(Vec<u8>), Bitmap(Vec<u8>) }`
  - `pub struct WriteInputs<'a> { kind: &'a str, content: Option<&'a str>, html: Option<&'a str>, rtf: Option<&'a [u8]>, bmp: Option<&'a [u8]> }`
  - `pub fn plan_formats(input: WriteInputs<'_>) -> Vec<FormatWrite>`
  - `pub fn write_item_to_clipboard(item: &ClipboardItem) -> Result<(), AppError>`
  - `pub use write::{write_item_to_clipboard, FormatWrite, WriteInputs, plan_formats};`

**背景：** `clipboard-win` 的 `raw::set_bitmap` 用 `options::NoClear::EMPTY_FN`（空操作），**不调 `EmptyClipboard`**，导致旧格式残留（缺陷 B）。统一入口手动 `Clipboard::new_attempts` → `empty()` → 逐格式 `set()`。

- [ ] **Step 1: 写失败测试（分发逻辑，纯函数）**

创建 `crates/clipboard/src/write.rs`：

```rust
//! 剪贴板写回：**单一入口**，打开剪贴板后先 `EmptyClipboard` 再按 kind 写多格式。
//!
//! 缺陷 B 根因：`clipboard-win` 的 `raw::set_bitmap` 使用 `NoClear`（不 EmptyClipboard），
//! 旧格式（如 CF_UNICODETEXT）会残留，粘贴得到「文本 + 图片」。此模块统一先清空。

use std::path::Path;

use clipboard_win::{Clipboard, ErrorCode, formats, register_format, set};
use clipboard_win::SysResult;

use adl_errors::AppError;
use adl_types::types::clipboard::ClipboardItem;

use crate::read::png_to_bmp24;

/// 一次写回要落到的具体格式。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FormatWrite {
    Unicode(String),
    Html(String),
    Rtf(Vec<u8>),
    Bitmap(Vec<u8>),
}

/// `plan_formats` 的输入（纯数据，便于单测）。
pub struct WriteInputs<'a> {
    pub kind: &'a str,
    pub content: Option<&'a str>,
    pub html: Option<&'a str>,
    pub rtf: Option<&'a [u8]>,
    pub bmp: Option<&'a [u8]>,
}

/// 决定一条条目要写哪些格式。载荷缺失时降级到纯文本；都不存在则返回空（不写）。
pub fn plan_formats(input: WriteInputs<'_>) -> Vec<FormatWrite> {
    let text = input.content.filter(|t| !t.is_empty());
    let unicode = || text.map(|t| FormatWrite::Unicode(t.to_string()));
    match input.kind {
        "image" => input.bmp.map(|b| vec![FormatWrite::Bitmap(b.to_vec())]).unwrap_or_default(),
        "html" => match input.html {
            Some(h) => unicode().into_iter().chain([FormatWrite::Html(h.to_string())]).collect(),
            None => unicode().into_iter().collect(),
        },
        "rtf" => match input.rtf {
            Some(r) => unicode().into_iter().chain([FormatWrite::Rtf(r.to_vec())]).collect(),
            None => unicode().into_iter().collect(),
        },
        _ => unicode().into_iter().collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_plans_only_bitmap() {
        let b = vec![1u8, 2, 3];
        let got = plan_formats(WriteInputs { kind: "image", content: None, html: None, rtf: None, bmp: Some(&b) });
        assert_eq!(got, vec![FormatWrite::Bitmap(b)]);
    }

    #[test]
    fn image_without_payload_writes_nothing() {
        let got = plan_formats(WriteInputs { kind: "image", content: Some("x"), html: None, rtf: None, bmp: None });
        assert!(got.is_empty());
    }

    #[test]
    fn html_plans_text_then_html() {
        let got = plan_formats(WriteInputs {
            kind: "html", content: Some("plain"), html: Some("<b>hi</b>"), rtf: None, bmp: None,
        });
        assert_eq!(got, vec![FormatWrite::Unicode("plain".into()), FormatWrite::Html("<b>hi</b>".into())]);
    }

    #[test]
    fn rtf_plans_text_then_rtf() {
        let r = b"{\\rtf1}".to_vec();
        let got = plan_formats(WriteInputs {
            kind: "rtf", content: Some("plain"), html: None, rtf: Some(&r), bmp: None,
        });
        assert_eq!(got, vec![FormatWrite::Unicode("plain".into()), FormatWrite::Rtf(r)]);
    }

    #[test]
    fn missing_richtext_falls_back_to_text() {
        let got = plan_formats(WriteInputs { kind: "html", content: Some("t"), html: None, rtf: None, bmp: None });
        assert_eq!(got, vec![FormatWrite::Unicode("t".into())]);
    }

    #[test]
    fn empty_text_is_not_written() {
        let got = plan_formats(WriteInputs { kind: "text", content: Some(""), html: None, rtf: None, bmp: None });
        assert!(got.is_empty());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-clipboard write:: -- --nocapture`
Expected: 编译失败 —— `write` 模块未在 `lib.rs` 声明 / `png_to_bmp24` 可见性不足。

- [ ] **Step 3: 最小实现（挂模块 + 执行器）**

`crates/clipboard/src/lib.rs` 改为：

```rust
pub mod image;
pub mod monitor;
pub mod read;
pub mod store;
pub mod write;

pub use monitor::ClipboardMonitor;
pub use read::write_image_to_clipboard;
pub use store::ClipboardStore;
pub use write::{FormatWrite, WriteInputs, plan_formats, write_item_to_clipboard};
```

在 `crates/clipboard/src/write.rs` 的 `plan_formats` 之后追加执行器与入口：

```rust
/// 真正写系统剪贴板：打开 → `EmptyClipboard`（治缺陷 B）→ 逐格式写入 → 关闭。
fn apply(writes: &[FormatWrite]) -> SysResult<()> {
    let _clip = Clipboard::new_attempts(10)?;
    clipboard_win::empty()?;
    for w in writes {
        match w {
            FormatWrite::Unicode(text) => set(formats::Unicode, text.as_str())?,
            FormatWrite::Html(html) => {
                let fmt = formats::Html::new().ok_or_else(|| ErrorCode::new_system(0))?;
                set(fmt, html.as_str())?;
            },
            FormatWrite::Rtf(bytes) => {
                let code = register_format("Rich Text Format").ok_or_else(|| ErrorCode::new_system(0))?;
                set(formats::RawData(code.get()), bytes.as_slice())?;
            },
            FormatWrite::Bitmap(bytes) => set(formats::Bitmap, bytes.as_slice())?,
        }
    }
    Ok(())
}

fn read_to_string(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

/// 一条 `ClipboardItem` 的完整写回：加载富文本载荷（超限/缺失返回 None）→ 计划 → 执行。
pub fn write_item_to_clipboard(item: &ClipboardItem) -> Result<(), AppError> {
    let html = item.html_path.as_deref().and_then(|p| read_to_string(Path::new(p)));
    let rtf = item.rtf_path.as_deref().and_then(|p| std::fs::read(Path::new(p)).ok());
    let bmp = match item.image_path.as_deref() {
        Some(p) => Some(png_to_bmp24(Path::new(p))?),
        None => None,
    };
    let writes = plan_formats(WriteInputs {
        kind: &item.kind,
        content: item.content.as_deref(),
        html: html.as_deref(),
        rtf: rtf.as_deref(),
        bmp: bmp.as_deref(),
    });
    if writes.is_empty() {
        return Err(AppError::InvalidInput("clipboard item has no writable payload".into()));
    }
    apply(&writes).map_err(|e| AppError::Io(format!("clipboard write: {e}")))
}
```

- [ ] **Step 4: 运行测试**

Run: `cd ai-digital-life && cargo test -p adl-clipboard`
Expected: PASS。

Run: `cd ai-digital-life && cargo clippy -p adl-clipboard -- -D warnings`
Expected: 无告警。

- [ ] **Step 5: 手动验证（写入 OS 剪贴板）**

构建并运行桌面应用，从剪贴板历史复制一条文本 → 在记事本粘贴（应为纯文本）；复制一条图片 → 在画图/聊天窗口粘贴（应**无彩色叠加层**，且**不再带出先前文本**）。把观察结果记录到 `docs/root-cause-resolution/2026-10/progress-2026-10-10-012530.md` 的事项 3 / 4。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/clipboard/src/write.rs ai-digital-life/crates/clipboard/src/lib.rs
git commit -m "fix(clipboard): unify write-back with EmptyClipboard before writing"
```

---

## Task 4: 后端路由 `/clipboard/write`（取代 `write-image`）

**Files:**
- Modify: `crates/server/src/handlers/clipboard.rs`
- Modify: `crates/server/src/router.rs:82`
- Test: `crates/server/src/handlers/clipboard.rs`（文件内 `#[cfg(test)]`）

**Interfaces:**
- Consumes: `adl_clipboard::write_item_to_clipboard(item)`
- Produces: `POST /clipboard/write` body `{"id": string}` → `IpcResult<bool>`；移除 `POST /clipboard/write-image`

- [ ] **Step 1: 改写既有测试为失败测试**

把 `write_image_unknown_id_returns_not_found` 与 `write_image_on_text_item_returns_invalid_input` 改名为 `write_unknown_id_returns_not_found` / `write_text_item_succeeds`，并把 URL `/clipboard/write-image` 换成 `/clipboard/write`；后者断言：

```rust
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["ok"], serde_json::json!(true));
        assert_eq!(body["data"], serde_json::json!(true));
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-server write_`
Expected: FAIL —— `/clipboard/write` 返回 404。

- [ ] **Step 3: 最小实现**

`crates/server/src/router.rs` 第 82 行替换：

```rust
        .route("/clipboard/write", post(handlers::clipboard::write))
```

`crates/server/src/handlers/clipboard.rs`：把 `WriteImageBody` 改名 `WriteBody`，`write_image` 改为：

```rust
/// POST `/clipboard/write` — body `{ "id": string }`. 加载条目并按 kind 写回系统剪贴板
/// （text / html / rtf / image），写前统一清空剪贴板（见 `adl_clipboard::write_item_to_clipboard`）。
pub async fn write(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: WriteBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let item = store
            .get(&input.id)?
            .ok_or_else(|| AppError::NotFound("clipboard item not found".into()))?;
        adl_clipboard::write_item_to_clipboard(&item)?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}
```

并把文件顶部 `use adl_clipboard::write_image_to_clipboard;` 删除（不再使用）。

- [ ] **Step 4: 运行测试**

Run: `cd ai-digital-life && cargo test -p adl-server clipboard`
Expected: PASS。

Run: `cd ai-digital-life && cargo clippy -p adl-server -- -D warnings`
Expected: 无告警（注意删除未使用的 import）。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/server/src/router.rs ai-digital-life/crates/server/src/handlers/clipboard.rs
git commit -m "feat(clipboard): replace write-image route with unified write"
```

---

## Task 5: 前端 IPC —— `write` 取代 `writeImage` + `getHtmlUrl` / `getRtfUrl`

**Files:**
- Modify: `frontend/src/shared/ipc/clipboard.ts`
- Modify: `frontend/src/httpBridge.ts:1120-1132`
- Modify: `frontend/src/mock-bridge.ts`、`frontend/src/mock/mock-clipboard.ts`
- Modify: `frontend/src/preview-bridge/index.ts:250-262`
- Modify: `frontend/src/app/stores/actions/utilitiesActions.ts:80-89`
- Test: `frontend/src/shared/ipc/__tests__/clipboard-bridge-parity.test.ts`（新建）

**Interfaces:**
- Consumes: Task 4 的 `POST /clipboard/write`
- Produces: `ClipboardBridge.write(id: string): Promise<IpcResult<boolean>>`、`getHtmlUrl(path: string): string`、`getRtfUrl(path: string): string`（移除 `writeImage`）

- [ ] **Step 1: 写失败测试（桥接契约一致性）**

新建 `frontend/src/shared/ipc/__tests__/clipboard-bridge-parity.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createHttpBridge } from '../../../httpBridge';

describe('clipboard bridge contract', () => {
  const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:1' });

  it('exposes write + asset url builders, not writeImage', () => {
    expect(typeof bridge.clipboard.write).toBe('function');
    expect(typeof bridge.clipboard.getHtmlUrl).toBe('function');
    expect(typeof bridge.clipboard.getRtfUrl).toBe('function');
    expect('writeImage' in bridge.clipboard).toBe(false);
  });

  it('builds asset urls from basename only', () => {
    expect(bridge.clipboard.getHtmlUrl('/data/clipboard/html/abc.html')).toBe(
      'http://127.0.0.1:1/clipboard/html/abc.html',
    );
    expect(bridge.clipboard.getRtfUrl('')).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/shared/ipc/__tests__/clipboard-bridge-parity.test.ts`
Expected: FAIL —— `write is not a function`。

- [ ] **Step 3: 最小实现（契约 + http + mock + preview + store）**

`frontend/src/shared/ipc/clipboard.ts`：把 `writeImage` 方法替换为：

```ts
  /**
   * 把一条剪贴板历史写回系统剪贴板（"再次复制"），按 kind 分发 text/html/rtf/image。
   * @param id 条目 ID
   * @command POST /clipboard/write (body { id })
   * @see httpBridge.ts → clipboard.write
   * @see mock-bridge.ts → clipboard.write
   * @see preview-bridge/index.ts → clipboard.write
   */
  write: (id: string) => Promise<IpcResult<boolean>>;
  /**
   * 把 HTML 载荷 sidecar 路径转成可访问 URL（`/clipboard/html/<filename>`）。
   * @see httpBridge.ts → clipboard.getHtmlUrl
   */
  getHtmlUrl: (htmlPath: string) => string;
  /**
   * 把 RTF 载荷 sidecar 路径转成可访问 URL（`/clipboard/rtf/<filename>`）。
   * @see httpBridge.ts → clipboard.getHtmlUrl
   */
  getRtfUrl: (rtfPath: string) => string;
```

`frontend/src/httpBridge.ts` 的 clipboard 块：

```ts
      write: (id: string) => call<boolean>(baseUrl, '/clipboard/write', POST({ id })),
      getThumbUrl: (thumbPath: string) => clipboardAssetUrl(baseUrl, 'thumb', thumbPath),
      getImageUrl: (imagePath: string) => clipboardAssetUrl(baseUrl, 'image', imagePath),
      getHtmlUrl: (htmlPath: string) => clipboardAssetUrl(baseUrl, 'html', htmlPath),
      getRtfUrl: (rtfPath: string) => clipboardAssetUrl(baseUrl, 'rtf', rtfPath),
```

`frontend/src/mock/mock-clipboard.ts` 与 `frontend/src/mock-bridge.ts`：

```ts
  write: async (_id: string) => ({ ok: true, data: true }),
  getHtmlUrl: (_htmlPath: string) => '',
  getRtfUrl: (_rtfPath: string) => '',
```

`frontend/src/preview-bridge/index.ts` 的 clipboard 块：删除 `getImageUrl` 之后的注释不必要，追加：

```ts
      getHtmlUrl: http.clipboard.getHtmlUrl,
      getRtfUrl: http.clipboard.getRtfUrl,
```

`frontend/src/app/stores/actions/utilitiesActions.ts`：

```ts
    writeClipboardItem: async (id: string) => {
      const result = await window.digitalLife.clipboard.write(id);
      if (result.ok && result.data === true) {
        return true;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
      return false;
    },
```

并把 JSDoc 里的 `clipboard.writeImage` 全部改为 `clipboard.write`。

- [ ] **Step 4: 运行测试与类型检查**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/shared/ipc/__tests__/clipboard-bridge-parity.test.ts src/app/components/__tests__/CopyButton.test.tsx`
Expected: PASS。

Run: `cd ai-digital-life/frontend && pnpm typecheck`
Expected: PASS（若 `ClipboardItemRow.test.tsx` 断言 `writeClipboardItem` 仍然成立则无需改）。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src
git commit -m "feat(clipboard): replace writeImage bridge with unified write + asset urls"
```

---

## Task 6: 捕获管线扩展（HTML / RTF，优先级与上限）

**Files:**
- Modify: `crates/clipboard/src/read.rs`
- Test: `crates/clipboard/src/read.rs`

**Interfaces:**
- Consumes: Task 1 的字段
- Produces: `pub(crate) fn pick_kind(has_image: bool, has_html: bool, has_rtf: bool, has_text: bool) -> Option<&'static str>`；`pub(crate) const MAX_RICH_PAYLOAD_BYTES: usize = 1024 * 1024;`

**优先级：** `image > html > rtf > text`。

- [ ] **Step 1: 写失败测试**

在 `crates/clipboard/src/read.rs` 的 `mod tests` 内追加：

```rust
    #[test]
    fn pick_kind_follows_precedence() {
        assert_eq!(pick_kind(true, true, true, true), Some("image"));
        assert_eq!(pick_kind(false, true, true, true), Some("html"));
        assert_eq!(pick_kind(false, false, true, true), Some("rtf"));
        assert_eq!(pick_kind(false, false, false, true), Some("text"));
        assert_eq!(pick_kind(false, false, false, false), None);
    }

    #[test]
    fn rich_payload_cap_is_one_mib() {
        assert_eq!(MAX_RICH_PAYLOAD_BYTES, 1024 * 1024);
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-clipboard pick_kind`
Expected: 编译失败 —— `cannot find function pick_kind`。

- [ ] **Step 3: 最小实现**

在 `crates/clipboard/src/read.rs` 顶部常量区追加：

```rust
/// 富文本（HTML / RTF）载荷体积上限：超限则不落盘富载荷、降级为纯文本。
pub(crate) const MAX_RICH_PAYLOAD_BYTES: usize = 1024 * 1024;

/// 依据各格式是否存在选出主类型。优先级：`image > html > rtf > text`。
pub(crate) fn pick_kind(
    has_image: bool,
    has_html: bool,
    has_rtf: bool,
    has_text: bool,
) -> Option<&'static str> {
    if has_image {
        Some("image")
    } else if has_html {
        Some("html")
    } else if has_rtf {
        Some("rtf")
    } else if has_text {
        Some("text")
    } else {
        None
    }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd ai-digital-life && cargo test -p adl-clipboard pick_kind`
Expected: PASS。

- [ ] **Step 5: 接入 `read_current`（探测 + 落盘 + 组装）**

把 `read_current` 的函数体替换为下述逻辑（保留既有图片分支的读取代码）：

```rust
pub fn read_current(store: &ClipboardStore) -> Result<Option<(ClipboardItem, bool)>, AppError> {
    let _clip = Clipboard::new_attempts(5)
        .map_err(|e| AppError::Io(format!("clipboard open failed: {e}")))?;

    // 1) 图片（CF_BITMAP / CF_DIB）
    let mut bmp: Vec<u8> = Vec::new();
    let has_image =
        formats::Bitmap.is_format_avail() && formats::Bitmap.read_clipboard(&mut bmp).is_ok() && !bmp.is_empty();

    // 2) HTML（"HTML Format" 注册格式，Getter<String> 自动剥离 CF_HTML 头）
    let html = formats::Html::new().and_then(|fmt| {
        if !fmt.is_format_avail() {
            return None;
        }
        let mut s = String::new();
        if fmt.read_clipboard(&mut s).is_ok() && !s.trim().is_empty() {
            Some(s)
        } else {
            None
        }
    });
    let html = html.filter(|h| h.len() <= MAX_RICH_PAYLOAD_BYTES);

    // 3) RTF（"Rich Text Format"，无内建类型 → 注册后按原始字节读）
    let rtf = register_format("Rich Text Format").and_then(|code| {
        let fmt = formats::RawData(code.get());
        if !fmt.is_format_avail() {
            return None;
        }
        let mut bytes: Vec<u8> = Vec::new();
        if fmt.read_clipboard(&mut bytes).is_ok() && !bytes.is_empty() {
            Some(bytes)
        } else {
            None
        }
    });
    let rtf = rtf.filter(|r| r.len() <= MAX_RICH_PAYLOAD_BYTES);

    // 4) 纯文本
    let mut raw = String::new();
    let text = if formats::Unicode.is_format_avail() && formats::Unicode.read_clipboard(&mut raw).is_ok() {
        normalized_text(&raw)
    } else {
        None
    };

    let kind = match pick_kind(has_image, html.is_some(), rtf.is_some(), text.is_some()) {
        Some(k) => k,
        None => return Ok(None),
    };

    let item = if kind == "image" {
        build_image_item(store, &bmp)?
    } else {
        build_rich_or_text_item(store, kind, text, html, rtf)?
    };
    let is_new = store.insert_or_bump(&item)?;
    Ok(Some((item, is_new)))
}
```

并新增：

```rust
/// 组装 text / html / rtf 条目：纯文本内联 `content`，富载荷落盘 sidecar。
fn build_rich_or_text_item(
    store: &ClipboardStore,
    kind: &str,
    text: Option<String>,
    html: Option<String>,
    rtf: Option<Vec<u8>>,
) -> Result<ClipboardItem, AppError> {
    let id = Uuid::new_v4().to_string();
    let html_path = match (kind, html.as_deref()) {
        ("html", Some(h)) => {
            let p = store.html_dir().join(format!("{id}.html"));
            std::fs::write(&p, h).map_err(|e| AppError::Io(format!("html write: {e}")))?;
            Some(p.to_string_lossy().into_owned())
        },
        _ => None,
    };
    let rtf_path = match (kind, rtf.as_deref()) {
        ("rtf", Some(r)) => {
            let p = store.rtf_dir().join(format!("{id}.rtf"));
            std::fs::write(&p, r).map_err(|e| AppError::Io(format!("rtf write: {e}")))?;
            Some(p.to_string_lossy().into_owned())
        },
        _ => None,
    };
    Ok(ClipboardItem {
        id,
        kind: kind.to_string(),
        content: text,
        digest: None,
        image_path: None,
        thumb_path: None,
        image_width: None,
        image_height: None,
        html_path,
        rtf_path,
        source_app: None,
        created_at: now_ms(),
    })
}
```

在文件顶部 import 增加 `use clipboard_win::register_format;`，并删除已被 `build_rich_or_text_item` 取代的 `build_text_item`。

- [ ] **Step 6: 运行测试**

Run: `cd ai-digital-life && cargo test -p adl-clipboard`
Expected: PASS（`build_text_item` 相关既有断言若存在需迁移到 `build_rich_or_text_item`）。

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/crates/clipboard/src/read.rs
git commit -m "feat(clipboard): capture HTML/RTF with precedence and size cap"
```

---

## Task 7: `ClipboardStore` 新目录与生命周期

**Files:**
- Modify: `crates/clipboard/src/store.rs`
- Test: `crates/clipboard/src/store.rs`

**Interfaces:**
- Consumes: Task 1 的 `html_path` / `rtf_path`
- Produces: `ClipboardStore::html_dir() -> &Path`、`rtf_dir() -> &Path`

- [ ] **Step 1: 写失败测试**

在 `crates/clipboard/src/store.rs` 的 `mod tests` 内追加：

```rust
    #[test]
    fn html_rtf_dirs_created_and_cleaned() {
        let store = temp_store("richtext");
        assert_eq!(store.html_dir().to_path_buf(), temp_dir().join("clip-data-richtext").join("html"));
        assert!(store.html_dir().exists());
        assert!(store.rtf_dir().exists());

        let hp = store.html_dir().join("a.html");
        let rp = store.rtf_dir().join("a.rtf");
        std::fs::write(&hp, b"<b>x</b>").unwrap();
        std::fs::write(&rp, b"{\\rtf1}").unwrap();
        let mut it = item("rt-1", "html", now_ms());
        it.content = Some("x".into());
        it.html_path = Some(hp.to_string_lossy().into_owned());
        it.rtf_path = Some(rp.to_string_lossy().into_owned());
        assert!(store.insert_or_bump(&it).unwrap());

        // 删除单条 → 富文本文件一并删除
        assert!(store.remove("rt-1").unwrap());
        assert!(!hp.exists());
        assert!(!rp.exists());

        // clear → 目录清空
        std::fs::write(&hp, b"y").unwrap();
        let mut it2 = item("rt-2", "html", now_ms());
        it2.content = Some("y".into());
        it2.html_path = Some(hp.to_string_lossy().into_owned());
        assert!(store.insert_or_bump(&it2).unwrap());
        assert_eq!(store.clear().unwrap(), 1);
        assert!(std::fs::read_dir(store.html_dir()).unwrap().next().is_none());

        let _ = std::fs::remove_dir_all(temp_dir().join("clip-data-richtext"));
        let _ = std::fs::remove_file(temp_dir().join("clip-richtext.db"));
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-clipboard html_rtf_dirs`
Expected: 编译失败 —— `no method html_dir`。

- [ ] **Step 3: 最小实现**

`crates/clipboard/src/store.rs`：struct 增字段、`new` 增目录、`delete_files` 与 `clear` 扩展：

```rust
pub struct ClipboardStore {
    db: Database,
    images_dir: PathBuf,
    thumbs_dir: PathBuf,
    html_dir: PathBuf,
    rtf_dir: PathBuf,
}
```

`new` 中：

```rust
        let html_dir = clipboard_dir.join("html");
        let rtf_dir = clipboard_dir.join("rtf");
        std::fs::create_dir_all(&images_dir).ok();
        std::fs::create_dir_all(&thumbs_dir).ok();
        std::fs::create_dir_all(&html_dir).ok();
        std::fs::create_dir_all(&rtf_dir).ok();
        Self { db, images_dir, thumbs_dir, html_dir, rtf_dir }
```

`delete_files`：

```rust
    fn delete_files(&self, item: &ClipboardItem) {
        for p in [&item.image_path, &item.thumb_path, &item.html_path, &item.rtf_path]
            .into_iter()
            .flatten()
        {
            let _ = std::fs::remove_file(Path::new(p));
        }
    }
```

`clear` 中在 thumbs 清理后追加：

```rust
        for dir in [&self.html_dir, &self.rtf_dir] {
            if let Ok(rd) = std::fs::read_dir(dir) {
                for e in rd.flatten() {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
```

访问器：

```rust
    pub fn html_dir(&self) -> &Path {
        &self.html_dir
    }
    pub fn rtf_dir(&self) -> &Path {
        &self.rtf_dir
    }
```

- [ ] **Step 4: 运行测试**

Run: `cd ai-digital-life && cargo test -p adl-clipboard`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/clipboard/src/store.rs
git commit -m "feat(clipboard): manage html/rtf sidecar dirs in store lifecycle"
```

---

## Task 8: 后端富文本资产路由

**Files:**
- Modify: `crates/server/src/router.rs`
- Modify: `crates/server/src/handlers/clipboard.rs`
- Test: `crates/server/src/handlers/clipboard.rs`

**Interfaces:**
- Consumes: Task 7 的 `html_dir()` / `rtf_dir()`
- Produces: `GET /clipboard/html/:filename`、`GET /clipboard/rtf/:filename` → `text/plain; charset=utf-8`

- [ ] **Step 1: 写失败测试**

在 `crates/server/src/handlers/clipboard.rs` 的 `mod tests` 内追加：

```rust
    #[tokio::test]
    async fn html_and_rtf_routes_serve_sidecars() {
        let state = test_server_state();
        std::fs::write(state.clipboard_store.html_dir().join("a.html"), b"<b>hi</b>").unwrap();
        std::fs::write(state.clipboard_store.rtf_dir().join("a.rtf"), b"{\\rtf1}").unwrap();
        let app = app_router(state.clone()).with_state(state.clone());

        let html = app
            .clone()
            .oneshot(
                Request::builder().method("GET").uri("/clipboard/html/a.html").body(Body::empty()).unwrap(),
            )
            .await
            .unwrap();
        assert!(html.status().is_success());
        let bytes = axum::body::to_bytes(html.into_body(), 1024).await.unwrap();
        assert_eq!(bytes.as_ref(), b"<b>hi</b>");

        let rtf = app
            .clone()
            .oneshot(
                Request::builder().method("GET").uri("/clipboard/rtf/a.rtf").body(Body::empty()).unwrap(),
            )
            .await
            .unwrap();
        assert!(rtf.status().is_success());

        let missing = app
            .oneshot(
                Request::builder().method("GET").uri("/clipboard/html/nope.html").body(Body::empty()).unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), axum::http::StatusCode::NOT_FOUND);
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-server html_and_rtf_routes`
Expected: FAIL —— 404。

- [ ] **Step 3: 最小实现**

`crates/server/src/router.rs` 在 `/clipboard/image/:filename` 之后追加：

```rust
        .route("/clipboard/html/:filename", get(handlers::clipboard::html))
        .route("/clipboard/rtf/:filename", get(handlers::clipboard::rtf))
```

`crates/server/src/handlers/clipboard.rs`：把 `serve_png` 泛化为 `serve_asset(dir, filename, content_type)`，`thumb` / `image` 传 `"image/png"`；新增：

```rust
/// GET `/clipboard/html/:filename` — 服务 HTML 载荷 sidecar（供富文本预览 iframe 取源）。
pub async fn html(
    State(state): State<ServerState>,
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> Response {
    serve_asset(state.clipboard_store.html_dir(), &filename, "text/plain; charset=utf-8").await
}

/// GET `/clipboard/rtf/:filename` — 服务 RTF 载荷 sidecar。
pub async fn rtf(
    State(state): State<ServerState>,
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> Response {
    serve_asset(state.clipboard_store.rtf_dir(), &filename, "text/plain; charset=utf-8").await
}
```

`serve_asset` 的签名与实现（沿用原 `serve_png` 的 basename 防穿越与 404 语义）：

```rust
async fn serve_asset(dir: &Path, filename: &str, content_type: &'static str) -> Response {
    let safe = Path::new(filename)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if safe.is_empty() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    match tokio::fs::read(dir.join(&safe)).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, content_type)], bytes).into_response(),
        Err(e) => {
            if e.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(error = %e, dir = %dir.display(), file = %safe, "clipboard asset read failed");
            }
            (StatusCode::NOT_FOUND, "not found").into_response()
        },
    }
}
```

同时把既有 `asset_routes_reject_traversal_and_degenerate_names` 测试的 URL 列表补上 `/clipboard/html/%2e%2e%2fsecret.html`、`/clipboard/rtf/..`。

- [ ] **Step 4: 运行测试**

Run: `cd ai-digital-life && cargo test -p adl-server clipboard`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/server/src/router.rs ai-digital-life/crates/server/src/handlers/clipboard.rs
git commit -m "feat(clipboard): serve html/rtf sidecar assets"
```

---

## Task 9: 前端类型展示（kind / 筛选 / 行 / i18n）

**Files:**
- Modify: `frontend/src/app/features/clipboard-history/clipboardKind.ts`
- Modify: `frontend/src/app/features/clipboard-history/clipboardFilter.ts:18`
- Modify: `frontend/src/app/features/clipboard-history/ClipboardItemRow.tsx`
- Modify: `frontend/src/app/i18n/zh-CN/utilities.ts`、`frontend/src/app/i18n/en-US/utilities.ts`
- Test: `frontend/src/app/features/clipboard-history/__tests__/clipboardFilter.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `htmlPath` / `rtfPath`；Task 5 的 `write`
- Produces: `getClipboardKindLabel` 支持 `html` / `rtf`；`KIND_ORDER = ['text', 'image', 'html', 'rtf']`

- [ ] **Step 1: 写失败测试**

在 `clipboardFilter.test.ts` 追加：

```ts
  it('orders html and rtf after image, before unknown kinds', () => {
    const items = [
      { kind: 'rtf', id: 'c' },
      { kind: 'text', id: 'a' },
      { kind: 'zz', id: 'e' },
      { kind: 'image', id: 'b' },
      { kind: 'html', id: 'd' },
    ] as never;
    expect(getClipboardKindCounts(items).map((c) => c.kind)).toEqual([
      'text',
      'image',
      'html',
      'rtf',
      'zz',
    ]);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history/__tests__/clipboardFilter.test.ts`
Expected: FAIL（顺序为 text/image/rtf/zz 或缺 html/rtf 标签）。

- [ ] **Step 3: 最小实现**

`clipboardFilter.ts`：

```ts
const KIND_ORDER = ['text', 'image', 'html', 'rtf'];
```

`clipboardKind.ts`：接口与函数扩展：

```ts
interface ClipboardKindLabels {
  clipboardText: string;
  clipboardImage: string;
  clipboardHtml: string;
  clipboardRtf: string;
}

export function getClipboardKindLabel(kind: string, t: ClipboardKindLabels): string {
  if (kind === 'image') return t.clipboardImage;
  if (kind === 'text') return t.clipboardText;
  if (kind === 'html') return t.clipboardHtml;
  if (kind === 'rtf') return t.clipboardRtf;
  return kind;
}
```

i18n（zh-CN）：`clipboardHtml: '富文本'`、`clipboardRtf: '富文本(RTF)'`；i18n（en-US）：`clipboardHtml: 'Rich text'`、`clipboardRtf: 'Rich text (RTF)'`。

`ClipboardItemRow.tsx`：预览分支由「image 或 text」改为三分支——`image` 缩略图、`html`/`rtf` 用 `content` 单行预览（与 text 相同的 `__preview` 节点）、其余同 text；复制 props：

```tsx
  const isImage = item.kind === 'image';
  const copyProps = { onCopy: () => writeClipboardItem(item.id) };
  const canCopy =
    isImage
      ? Boolean(item.imagePath)
      : item.kind === 'html'
        ? Boolean(item.htmlPath) || Boolean(item.content)
        : item.kind === 'rtf'
          ? Boolean(item.rtfPath) || Boolean(item.content)
          : Boolean(item.content);
```

- [ ] **Step 4: 运行测试与类型检查**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history`
Expected: PASS（`ClipboardItemRow.test.tsx` 的 `writeClipboardItem` 断言仍成立）。

Run: `cd ai-digital-life/frontend && pnpm typecheck && pnpm check:i18n`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src
git commit -m "feat(clipboard): surface html/rtf kinds in list, badge and filter"
```

---

## Task 10: 查看器工具栏（字符统计 / 默认字号 / 缩放 / 自动换行）

**Files:**
- Create: `frontend/src/app/features/clipboard-history/clipboardTextStats.ts`
- Modify: `frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx`
- Modify: `frontend/src/styles/regions/leftbar-clipboard.css:393-403`
- Modify: i18n `utilities.ts`（zh-CN / en-US）
- Test: `frontend/src/app/features/clipboard-history/__tests__/clipboardTextStats.test.ts`（新建）、`__tests__/ClipboardItemViewer.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: `clipboardTextStats(text: string): { chars: number; charsNoSpace: number; lines: number }`

- [ ] **Step 1: 写失败测试（统计纯函数）**

新建 `__tests__/clipboardTextStats.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { clipboardTextStats } from '../clipboardTextStats';

describe('clipboardTextStats', () => {
  it('counts chars, chars without spaces and lines', () => {
    expect(clipboardTextStats('ab cd\n中文')).toEqual({ chars: 9, charsNoSpace: 6, lines: 2 });
  });
  it('treats empty string as zero lines', () => {
    expect(clipboardTextStats('')).toEqual({ chars: 0, charsNoSpace: 0, lines: 0 });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history/__tests__/clipboardTextStats.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 最小实现（统计函数）**

`clipboardTextStats.ts`：

```ts
export interface ClipboardTextStats {
  chars: number;
  charsNoSpace: number;
  lines: number;
}

/** 文本统计：字符数、不含空白字符数、行数（空串为 0 行）。 */
export function clipboardTextStats(text: string): ClipboardTextStats {
  if (text.length === 0) {
    return { chars: 0, charsNoSpace: 0, lines: 0 };
  }
  const charsNoSpace = [...text].filter((ch) => !/\s/.test(ch)).length;
  return { chars: [...text].length, charsNoSpace, lines: text.split('\n').length };
}
```

- [ ] **Step 4: 运行测试**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history/__tests__/clipboardTextStats.test.ts`
Expected: PASS。

- [ ] **Step 5: 默认字号调大（12px → 14px）**

`leftbar-clipboard.css` 的 `.adl-clipboard-viewer__text` 中：

```css
  font-size: var(--text-sm);
```

- [ ] **Step 6: 查看器接入工具栏**

在 `ClipboardItemViewer.tsx` 中新增：`const [fontScale, setFontScale] = useState(1);`、`const [wrap, setWrap] = useState(true);`；文本分支渲染为：

```tsx
            <div className="adl-clipboard-viewer__tools">
              <span className="adl-clipboard-viewer__stats">
                {formatT(t, 'clipboardStatsSummary', {
                  chars: String(stats.chars),
                  noSpace: String(stats.charsNoSpace),
                  lines: String(stats.lines),
                })}
              </span>
              <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={() => setFontScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))} aria-label={t.clipboardZoomOut}>A-</button>
              <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={() => setFontScale(1)} aria-label={t.clipboardZoomReset}>{Math.round(fontScale * 100)}%</button>
              <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={() => setFontScale((s) => Math.min(4, +(s + 0.1).toFixed(2)))} aria-label={t.clipboardZoomIn}>A+</button>
              <button type="button" className="adl-icon-btn adl-icon-btn--xs" aria-pressed={wrap ? 'true' : 'false'} onClick={() => setWrap((w) => !w)} aria-label={t.clipboardWrapToggle}>↩</button>
            </div>
            <pre
              className="adl-clipboard-viewer__text"
              style={{
                fontSize: `calc(var(--text-sm) * ${fontScale})`,
                whiteSpace: wrap ? 'pre-wrap' : 'pre',
              }}
            >
              {item.content ?? ''}
            </pre>
```

`stats` 由 `useMemo(() => clipboardTextStats(item.content ?? ''), [item.content])` 得到。

i18n 新增 key：`clipboardStatsSummary`（zh：`{chars} 字符 · {noSpace} 不含空格 · {lines} 行`）、`clipboardZoomIn`（`放大字号`）、`clipboardZoomOut`（`缩小字号`）、`clipboardZoomReset`（`重置字号`）、`clipboardWrapToggle`（`切换自动换行`）。

`html` 条目另需**安全富文本预览**（spec §8.3）：

```tsx
  const [previewRich, setPreviewRich] = useState(false);
  const [htmlText, setHtmlText] = useState('');
  useEffect(() => {
    if (item.kind !== 'html' || !item.htmlPath) {
      return;
    }
    let cancelled = false;
    void fetch(window.digitalLife.clipboard.getHtmlUrl(item.htmlPath))
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setHtmlText(text);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item.id, item.kind, item.htmlPath]);
```

渲染：`previewRich && htmlText ? <iframe className="adl-clipboard-viewer__rich" sandbox="" srcDoc={htmlText} title={t.clipboardHtml} /> : <pre … />`。工具区加切换按钮：

```tsx
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                aria-pressed={previewRich ? 'true' : 'false'}
                onClick={() => setPreviewRich((v) => !v)}
                aria-label={t.clipboardPreviewRich}
              >
                <IconEye size={12} decorative />
              </button>
```

`sandbox=""` 同时禁用脚本与同源，**禁止**直接 `innerHTML` 渲染剪贴板 HTML。i18n 增 `clipboardPreviewRich`（zh `预览富文本` / en `Preview rich text`）。

- [ ] **Step 7: 运行测试**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history`
Expected: PASS（`ClipboardItemViewer.test.tsx` 若断言默认字号样式需同步更新为 `--text-sm`）。

Run: `cd ai-digital-life/frontend && pnpm typecheck && pnpm check:i18n`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src
git commit -m "feat(clipboard): viewer toolbar with stats, font zoom and wrap toggle"
```

---

## Task 11: 保存为文件（`clipboard.export`）

**Files:**
- Modify: `crates/server/src/handlers/clipboard.rs`、`crates/server/src/router.rs`
- Modify: `frontend/src/shared/ipc/clipboard.ts`、`httpBridge.ts`、`preview-bridge/index.ts`、`mock-bridge.ts`、`mock/mock-clipboard.ts`
- Modify: `frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx`
- Test: `crates/server/src/handlers/clipboard.rs`、`frontend/src/shared/ipc/__tests__/clipboard-bridge-parity.test.ts`

**Interfaces:**
- Consumes: Task 5 的桥接
- Produces: `GET /clipboard/export?id=<id>` → 文件字节 + `Content-Disposition`；浏览器模式由前端 `a[download]` 触发下载

**双端策略：** Tauri 与浏览器都走同一 HTTP 资产下载（`<a download>` 由前端触发），因此行为一致，无需原生保存对话框。

- [ ] **Step 1: 写失败测试（Rust）**

在 `crates/server/src/handlers/clipboard.rs` 的 `mod tests` 追加：

```rust
    #[tokio::test]
    async fn export_returns_payload_with_filename() {
        let state = test_server_state();
        state.clipboard_store.insert_or_bump(&sample_item("e-1", "hello")).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder().method("GET").uri("/clipboard/export?id=e-1").body(Body::empty()).unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        assert!(resp.headers().get(axum::http::header::CONTENT_DISPOSITION).is_some());
        let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        assert_eq!(bytes.as_ref(), b"hello");
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-server export_returns`
Expected: FAIL —— 404。

- [ ] **Step 3: 最小实现（后端）**

`router.rs` 追加 `.route("/clipboard/export", get(handlers::clipboard::export))`。

`handlers/clipboard.rs`：

```rust
#[derive(serde::Deserialize)]
pub struct ExportQuery {
    pub id: String,
}

/// GET `/clipboard/export?id=N` — 以文件形式返回条目载荷（text→.txt / html→.html / rtf→.rtf / image→.png）。
pub async fn export(State(state): State<ServerState>, Query(q): Query<ExportQuery>) -> Response {
    let store = state.clipboard_store.clone();
    let loaded = run_blocking(move || -> Result<(Vec<u8>, String, &'static str), AppError> {
        let item = store
            .get(&q.id)?
            .ok_or_else(|| AppError::NotFound("clipboard item not found".into()))?;
        match item.kind.as_str() {
            "image" => {
                let p = item.image_path.ok_or_else(|| AppError::NotFound("no image".into()))?;
                let bytes = std::fs::read(&p).map_err(|e| AppError::Io(e.to_string()))?;
                Ok((bytes, format!("clipboard-{}.png", item.id), "image/png"))
            },
            "html" => {
                let p = item.html_path.ok_or_else(|| AppError::NotFound("no html".into()))?;
                let bytes = std::fs::read(&p).map_err(|e| AppError::Io(e.to_string()))?;
                Ok((bytes, format!("clipboard-{}.html", item.id), "text/plain; charset=utf-8"))
            },
            "rtf" => {
                let p = item.rtf_path.ok_or_else(|| AppError::NotFound("no rtf".into()))?;
                let bytes = std::fs::read(&p).map_err(|e| AppError::Io(e.to_string()))?;
                Ok((bytes, format!("clipboard-{}.rtf", item.id), "text/plain; charset=utf-8"))
            },
            _ => Ok((
                item.content.unwrap_or_default().into_bytes(),
                format!("clipboard-{}.txt", item.id),
                "text/plain; charset=utf-8",
            )),
        }
    })
    .await;
    match loaded {
        Ok((bytes, filename, ctype)) => (
            [
                (header::CONTENT_TYPE, ctype.to_string()),
                (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{filename}\"")),
            ],
            bytes,
        )
            .into_response(),
        Err(e) => ipc::to_response::<serde_json::Value>(Err(e)).into_response(),
    }
}
```

- [ ] **Step 4: 运行 Rust 测试**

Run: `cd ai-digital-life && cargo test -p adl-server export_returns`
Expected: PASS。

- [ ] **Step 5: 前端桥接 + 查看器按钮**

`shared/ipc/clipboard.ts` 增 `exportUrl(id: string): string;`；`httpBridge.ts` 增 `exportUrl: (id: string) => \`${baseUrl}/clipboard/export?id=${encodeURIComponent(id)}\``；mock/preview 同步（mock 返回 `''`，preview 走 http）。

`ClipboardItemViewer.tsx` 工具区增：

```tsx
              <a
                className="adl-icon-btn adl-icon-btn--xs"
                href={window.digitalLife.clipboard.exportUrl(item.id)}
                download
                aria-label={t.clipboardExport}
              >
                <IconDownload size={12} decorative />
              </a>
```

i18n 增 `clipboardExport`（zh `保存为文件` / en `Save to file`）。

- [ ] **Step 6: 运行前端测试**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history src/shared/ipc`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/crates/server/src ai-digital-life/frontend/src
git commit -m "feat(clipboard): export clipboard item as a file"
```

---

## Task 12: `clipboard.update`（编辑落库，原地更新）

**Files:**
- Modify: `crates/server/src/handlers/clipboard.rs`、`crates/server/src/router.rs`
- Modify: `frontend/src/shared/ipc/clipboard.ts`、`httpBridge.ts`、`preview-bridge/index.ts`、`mock-bridge.ts`、`mock/mock-clipboard.ts`
- Modify: `frontend/src/app/stores/actions/utilitiesActions.ts`、`frontend/src/app/stores/slices/clipboardHistorySlice.ts`、`frontend/src/app/stores/StoreState.ts`
- Test: `crates/server/src/handlers/clipboard.rs`

**Interfaces:**
- Consumes: Task 1 的模型
- Produces: `POST /clipboard/update` body `{ id, content }` → `IpcResult<ClipboardItem>`；store action `updateClipboardItem(id: string, content: string): Promise<boolean>`

**语义：** 仅 `kind === 'text'`；保持 `created_at` 不变（列表按 `createdAt` 倒序，位置不变）；空内容拒绝。

- [ ] **Step 1: 写失败测试**

```rust
    #[tokio::test]
    async fn update_edits_text_in_place_and_keeps_created_at() {
        let state = test_server_state();
        let mut it = sample_item("u-1", "before");
        it.created_at = 111;
        state.clipboard_store.insert_or_bump(&it).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/update")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"id":"u-1","content":"after"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["data"]["content"], serde_json::json!("after"));
        assert_eq!(body["data"]["createdAt"], serde_json::json!(111));

        let missing = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/update")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"id":"u-1","content":"  "}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), axum::http::StatusCode::BAD_REQUEST);
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-server update_edits`
Expected: FAIL —— 404。

- [ ] **Step 3: 最小实现（后端）**

`router.rs` 追加 `.route("/clipboard/update", post(handlers::clipboard::update))`。

`handlers/clipboard.rs`：

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBody {
    id: String,
    content: String,
}

/// POST `/clipboard/update` — body `{ id, content }`。仅 `text` 条目可编辑；
/// 原地更新 `content` 并**保留 `created_at`**（列表按 createdAt 倒序 → 位置不变）。
pub async fn update(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: UpdateBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut item = store
            .get(&input.id)?
            .ok_or_else(|| AppError::NotFound("clipboard item not found".into()))?;
        if item.kind != "text" {
            return Err(AppError::InvalidInput("only text items are editable".into()));
        }
        if input.content.trim().is_empty() {
            return Err(AppError::InvalidInput("content must not be empty".into()));
        }
        item.content = Some(input.content);
        store.save(&item)?;
        Ok(serde_json::to_value(&item)?)
    })
    .await;
    ipc::to_response(result)
}
```

`crates/clipboard/src/store.rs` 增 `save`（复用既有 `save_entity`，不改排序时间戳字段）：

```rust
    /// 原地覆盖一条已有条目（保持其 `created_at`，仅供编辑保存使用）。
    pub fn save(&self, item: &ClipboardItem) -> Result<(), AppError> {
        self.db.save_entity(
            EntityTable::ClipboardItems,
            &item.id,
            None,
            None,
            Some(&item.kind),
            item,
        )
    }
```

- [ ] **Step 4: 运行 Rust 测试**

Run: `cd ai-digital-life && cargo test -p adl-server clipboard`
Expected: PASS。

- [ ] **Step 5: 前端桥接 + store**

`shared/ipc/clipboard.ts` 增 `update: (id: string, content: string) => Promise<IpcResult<ClipboardItem>>;`；`httpBridge.ts` 增 `update: (id, content) => call<ClipboardItem>(baseUrl, '/clipboard/update', POST({ id, content }))`；`mock` 返回 `{ ok: true, data: { ... } }`（用传入 id/content 构造最小对象）；`preview-bridge` 的 clipboard 块无需显式新增（`...preferHttpWhenReachable` 自动代理普通异步方法）。

`clipboardHistorySlice.ts` 增：

```ts
  replaceClipboardHistoryItem: (item: ClipboardItem) => void;
  // 实现
  replaceClipboardHistoryItem: (item) =>
    set((state) => ({
      clipboardHistory: state.clipboardHistory.map((it) => (it.id === item.id ? item : it)),
    })),
```

`StoreState.ts` 增 `updateClipboardItem: (id: string, content: string) => Promise<boolean>;`
`utilitiesActions.ts`：

```ts
    updateClipboardItem: async (id: string, content: string) => {
      const result = await window.digitalLife.clipboard.update(id, content);
      if (result.ok) {
        get().replaceClipboardHistoryItem(result.data);
        return true;
      }
      captureError(get, result.error, SCOPE);
      return false;
    },
```

- [ ] **Step 6: 运行测试与类型检查**

Run: `cd ai-digital-life/frontend && pnpm typecheck && pnpm vitest run src/app/stores`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/crates ai-digital-life/frontend/src
git commit -m "feat(clipboard): add in-place text edit IPC and store action"
```

---

## Task 13: 撤销栈（纯逻辑）

**Files:**
- Create: `frontend/src/app/features/clipboard-history/clipboardUndoStack.ts`
- Test: `frontend/src/app/features/clipboard-history/__tests__/clipboardUndoStack.test.ts`

**Interfaces:**
- Produces: `createUndoStack(initial: string): { current(): string; push(next: string): void; undo(): string; redo(): string; canUndo(): boolean; canRedo(): boolean }`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { createUndoStack } from '../clipboardUndoStack';

describe('createUndoStack', () => {
  it('undoes and redoes snapshots', () => {
    const s = createUndoStack('a');
    s.push('ab');
    s.push('abc');
    expect(s.current()).toBe('abc');
    expect(s.undo()).toBe('ab');
    expect(s.undo()).toBe('a');
    expect(s.canUndo()).toBe(false);
    expect(s.redo()).toBe('ab');
    expect(s.current()).toBe('ab');
  });

  it('drops the redo tail after a new push', () => {
    const s = createUndoStack('a');
    s.push('ab');
    s.undo();
    s.push('ax');
    expect(s.canRedo()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history/__tests__/clipboardUndoStack.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 最小实现**

```ts
export interface UndoStack {
  current(): string;
  push(next: string): void;
  undo(): string;
  redo(): string;
  canUndo(): boolean;
  canRedo(): boolean;
}

/** 快照式撤销栈：每次编辑压栈；`push` 会丢弃 redo 尾部（标准编辑器语义）。 */
export function createUndoStack(initial: string): UndoStack {
  const stack: string[] = [initial];
  let index = 0;
  return {
    current: () => stack[index],
    push: (next) => {
      if (next === stack[index]) {
        return;
      }
      stack.length = index + 1;
      stack.push(next);
      index = stack.length - 1;
    },
    undo: () => (index > 0 ? (index--, stack[index]) : stack[index]),
    redo: () => (index < stack.length - 1 ? (index++, stack[index]) : stack[index]),
    canUndo: () => index > 0,
    canRedo: () => index < stack.length - 1,
  };
}
```

- [ ] **Step 4: 运行测试**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history/__tests__/clipboardUndoStack.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/clipboard-history/clipboardUndoStack.ts ai-digital-life/frontend/src/app/features/clipboard-history/__tests__/clipboardUndoStack.test.ts
git commit -m "feat(clipboard): add undo stack for text editing"
```

---

## Task 14: 编辑模式（快捷键 + 关闭即保存）

**Files:**
- Modify: `frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx`
- Modify: i18n `utilities.ts`（zh-CN / en-US）
- Test: `frontend/src/app/features/clipboard-history/__tests__/ClipboardItemViewer.test.tsx`

**Interfaces:**
- Consumes: Task 12 的 `updateClipboardItem`、Task 13 的 `createUndoStack`
- Produces: 编辑模式交互契约（`Ctrl+Z` 撤回 / `Ctrl+Y` 重做 / `Ctrl+S` 保存 / `Esc` 取消更改；关闭 = 保存并关闭）

- [ ] **Step 1: 写失败测试**

在 `ClipboardItemViewer.test.tsx` 追加（store 打桩见该文件既有 `useAppStore` mock 模式）：

```tsx
  it('saves on close while editing', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem });
    render(<ClipboardItemViewer item={textItem('c1', 'hello')} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: t.clipboardEdit }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'changed');
    await userEvent.click(screen.getByRole('button', { name: t.close }));

    expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'changed');
  });

  it('Ctrl+Z undoes and Esc cancels back to the original', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem });
    render(<ClipboardItemViewer item={textItem('c1', 'hello')} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: t.clipboardEdit }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(box, 'X');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(box.value).toBe('hello');

    await userEvent.type(box, 'Y');
    await userEvent.keyboard('{Escape}');
    expect(updateClipboardItem).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history/__tests__/ClipboardItemViewer.test.tsx`
Expected: FAIL —— 无编辑按钮 / `textbox`。

- [ ] **Step 3: 最小实现**

在 `ClipboardItemViewer.tsx` 中：

1. `const canEdit = item.kind === 'text';`、`const [editing, setEditing] = useState(false);`、`const [draft, setDraft] = useState(item.content ?? '');`、`const stackRef = useRef(createUndoStack(item.content ?? ''));`。
2. 文本分支：`editing ? <textarea className="adl-clipboard-viewer__editor" value={draft} onChange={...} /> : <pre .../>`；`onChange` 内 `stackRef.current.push(v); setDraft(v);`。
3. `commitIfEditing`：

```tsx
  const commitIfEditing = async () => {
    if (!editing) {
      return;
    }
    if (!draft.trim()) {
      return;
    }
    if (draft !== (item.content ?? '')) {
      await updateClipboardItem(item.id, draft);
    }
    setEditing(false);
  };
```

4. 键处理（并入既有 `keydown` effect）：

```tsx
      if (!editing) {
        return;
      }
      if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setDraft(stackRef.current.undo());
      } else if (event.key === 'y' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setDraft(stackRef.current.redo());
      } else if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void commitIfEditing();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setDraft(item.content ?? '');
        stackRef.current = createUndoStack(item.content ?? '');
        setEditing(false);
      }
```

5. 关闭路径：把 `onClose` 的所有调用点（关闭按钮 / 遮罩点击）改为 `void closeAndMaybeSave()`，其中：

```tsx
  const closeAndMaybeSave = async () => {
    await commitIfEditing();
    onClose();
  };
```

6. 工具区在 `canEdit` 时渲染编辑按钮：

```tsx
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                aria-pressed={editing ? 'true' : 'false'}
                onClick={() => setEditing(true)}
                aria-label={t.clipboardEdit}
              >
                <IconEdit size={12} decorative />
              </button>
```

7. 样式（`leftbar-clipboard.css`）：`.adl-clipboard-viewer__editor` 与 `__text` 同样式并 `width: 100%; resize: none; background: transparent; border: none;`。

i18n 增 `clipboardEdit`（zh `编辑` / en `Edit`）。

- [ ] **Step 4: 运行测试**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/app/features/clipboard-history`
Expected: PASS。

Run: `cd ai-digital-life/frontend && pnpm typecheck && pnpm check:i18n`
Expected: PASS。

- [ ] **Step 5: 手动验证关闭即保存**

运行应用：编辑一条文本 → 直接点 `X` 关闭 → 重新打开该条，确认内容已保存。把结果记入进度文件事项 2。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src
git commit -m "feat(clipboard): text edit mode with undo, shortcuts and save-on-close"
```

---

## Task 15: 实时刷新（事件推送 + 轮询降级）

**Files:**
- Modify: `crates/kernel/src/events.rs:52,112`
- Modify: `crates/server/src/engine.rs:248-258`
- Modify: `crates/server/src/ws_workspace.rs`
- Modify: `frontend/src/shared/ipc/workspace-events-ws.ts`
- Modify: `frontend/src/shared/ipc/clipboard.ts`、`httpBridge.ts`、`preview-bridge/index.ts`、`mock-bridge.ts`、`mock/mock-clipboard.ts`
- Modify: `frontend/src/app/features/clipboard-history/ClipboardHistoryList.tsx`
- Test: `crates/server/src/ws_workspace.rs`、`frontend/src/shared/ipc/__tests__/workspace-events-ws.test.ts`、`__tests__/ClipboardHistoryList.test.tsx`

**Interfaces:**
- Consumes: `ClipboardMonitor::subscribe()`
- Produces:
  - `AppEvent::ClipboardChanged`（无负载单元变体）
  - WS 帧 `{"kind":"clipboard-changed"}`
  - `ClipboardBridge.onChanged(listener: () => void): () => void`
  - `WorkspaceEventsClient.onClipboardChanged(listener: () => void): () => void`

- [ ] **Step 1: 写失败测试（Rust 帧形状）**

在 `crates/server/src/ws_workspace.rs` 的 `mod tests` 追加：

```rust
    #[test]
    fn clipboard_changed_frame_shape_is_locked() {
        let frame = clipboard_changed_frame();
        assert_eq!(frame["kind"], "clipboard-changed");
    }
```

在 `crates/kernel/src/events.rs` 的测试模块（若无则新建）追加：

```rust
    #[test]
    fn clipboard_changed_kind_is_stable() {
        assert_eq!(AppEvent::ClipboardChanged.kind(), "clipboard.changed");
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life && cargo test -p adl-kernel clipboard_changed && cargo test -p adl-server clipboard_changed_frame`
Expected: 编译失败 —— `ClipboardChanged` 需要 1 个参数 / `clipboard_changed_frame` 未定义。

- [ ] **Step 3: 最小实现（后端）**

`crates/kernel/src/events.rs`：变体改为 `ClipboardChanged,`（文档注释更新为"剪贴板历史新增/变更信号"）；`kind()` 分支改为 `Self::ClipboardChanged => "clipboard.changed",`；`to_json()` 中该分支按既有模式输出 `{"type":"clipboard.changed"}`。

`crates/server/src/ws_workspace.rs`：

```rust
/// 构造 `clipboard-changed` WS 帧：与 `files_changed_frame` 同构，形状由单测锁定。
pub(crate) fn clipboard_changed_frame() -> serde_json::Value {
    serde_json::json!({ "kind": "clipboard-changed" })
}
```

forwarder 的 `match` 中，在 `FilesChanged` 分支之后插入：

```rust
                Ok(adl_kernel::events::AppEvent::ClipboardChanged) => {
                    let frame = clipboard_changed_frame();
                    if !try_send_frame(&tx, Message::Text(frame.to_string()), &mut pending_overflow) {
                        break;
                    }
                },
```

`crates/server/src/engine.rs` 的 `start_background_services`：

```rust
    let monitor = ClipboardMonitor::new();
    let mut changes = monitor.subscribe();
    let monitor_handle = monitor.spawn(state.clipboard_store.clone());

    // 监听广播 → 事件总线：此前该 broadcast 无订阅者、ClipboardChanged 从未 emit，
    // 前端只能靠 2s 轮询。
    let bus = state.event_bus.clone();
    std::thread::spawn(move || {
        while let Ok(_signal) = changes.blocking_recv() {
            bus.emit(adl_kernel::events::AppEvent::ClipboardChanged);
        }
    });
```

> 若 `broadcast::Receiver` 无 `blocking_recv`，改用 `tokio::runtime::Handle::current()` 不可用场景下的同步等待：`while let Ok(_) = changes.try_recv().or_else(|_| { std::thread::sleep(Duration::from_millis(200)); changes.try_recv() })`。实施前先确认 `tokio::sync::broadcast::Receiver::blocking_recv` 可用（`tokio` 的 `sync` feature 已启用）；不可用则用上述轮询兜底并加注释。

- [ ] **Step 4: 运行 Rust 测试**

Run: `cd ai-digital-life && cargo test -p adl-kernel clipboard_changed && cargo test -p adl-server`
Expected: PASS。

- [ ] **Step 5: 写失败测试（前端 WS 分派）**

在 `workspace-events-ws.test.ts` 追加：

```ts
  it('routes clipboard-changed frames to clipboard listeners', () => {
    const client = createWorkspaceEventsClient('http://h/', { wsFactory: fakeFactory });
    const onFiles = vi.fn();
    const onClip = vi.fn();
    client.onFilesChanged(onFiles);
    client.onClipboardChanged(onClip);
    fakeFactory.socket.serverSend(JSON.stringify({ kind: 'clipboard-changed' }));
    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onFiles).not.toHaveBeenCalled();
  });
```

在 `ClipboardHistoryList.test.tsx` 追加：

```tsx
  it('refetches immediately when clipboard changes', async () => {
    render(<ClipboardHistoryList />);
    fakeBridge.clipboard.emitChange();
    await waitFor(() => expect(fetchClipboardHistory).toHaveBeenCalledTimes(2));
  });
```

- [ ] **Step 6: 运行测试确认失败**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/shared/ipc/__tests__/workspace-events-ws.test.ts src/app/features/clipboard-history/__tests__/ClipboardHistoryList.test.tsx`
Expected: FAIL —— `onClipboardChanged` / `emitChange` 未定义。

- [ ] **Step 7: 最小实现（前端）**

`workspace-events-ws.ts`：`WorkspaceEventsClient` 增 `onClipboardChanged(listener: () => void): () => void;`；内部改为两个 `Set`；`handleFrame` 按 `kind` 分派：

```ts
    if (frame.kind === 'clipboard-changed') {
      clipboardListeners.forEach((fn) => fn());
      return;
    }
    if (frame.kind !== 'files-changed') {
      return;
    }
```

重连成功（`hasConnected` 分支）时同时 `clipboardListeners.forEach((fn) => fn())`。

`shared/ipc/clipboard.ts` 增 `onChanged: (listener: () => void) => () => void;`
`httpBridge.ts` clipboard 块增 `onChanged: (listener) => getWorkspaceEvents().onClipboardChanged(listener),`
`preview-bridge/index.ts` clipboard 块增 `onChanged: http.clipboard.onChanged,`（**放在 `...preferHttpWhenReachable` 展开之外**，避免被代理异步包装破坏"同步返回 unsubscribe"契约）。
`mock-bridge.ts` / `mock/mock-clipboard.ts` 增 `onChanged: () => () => {},`

`ClipboardHistoryList.tsx`：

```tsx
const REFRESH_INTERVAL_MS = 10000;
const CHANGE_THROTTLE_MS = 100;
// effect 内：
  const unsubscribe = window.digitalLife.clipboard.onChanged(() => {
    if (throttleRef.current !== undefined) return;
    throttleRef.current = window.setTimeout(() => { throttleRef.current = undefined; }, CHANGE_THROTTLE_MS);
    void fetchClipboardHistory(true);
  });
  return () => { unsubscribe(); if (throttleRef.current !== undefined) window.clearTimeout(throttleRef.current); /* 既有清理 */ };
```

- [ ] **Step 8: 运行测试与全量受影响验证**

Run: `cd ai-digital-life/frontend && pnpm vitest run src/shared/ipc src/app/features/clipboard-history`
Expected: PASS。

Run: `cd ai-digital-life/frontend && pnpm typecheck && pnpm lint`
Expected: PASS。

- [ ] **Step 9: 手动验证实时性**

运行应用 → 在记事本复制一段文字 → 观察剪贴板历史应在**数百毫秒内**出现新条目（此前约 1–2 s）。把结果记入进度文件事项 5。

- [ ] **Step 10: Commit**

```bash
git add ai-digital-life/crates ai-digital-life/frontend/src
git commit -m "feat(clipboard): push clipboard changes over /ws/workspace for instant refresh"
```

---

## Self-Review

**1. Spec 覆盖核对**

| Spec 章节 | 覆盖任务 |
|---|---|
| §5 数据模型（`html_path`/`rtf_path`、sidecar、1 MiB 上限） | Task 1、Task 6、Task 7 |
| §6 捕获管线（优先级 `image>html>rtf>text`） | Task 6 |
| §7 写回路径（统一入口 + `EmptyClipboard` + 24 位 BMP） | Task 2、Task 3、Task 4、Task 5 |
| §8.1–8.2 弹窗工具栏（统计/缩放/换行/复制/保存为文件） | Task 10、Task 11 |
| §8.3 富文本安全预览 | 见"已知缺口" |
| §8.4 编辑模式（撤销栈/快捷键/关闭即保存） | Task 12、Task 13、Task 14 |
| §8.5 默认字号 12px → 14px | Task 10（Step 5） |
| §9 IPC 与双端清单 | Task 4/5/8/11/12/15 |
| §10 存储与生命周期 | Task 7 |
| §11 测试计划 | 各任务 Step 1–4 |
| §12 风险（透明合成白底、体积上限、沙箱预览、节流兜底） | Task 2、Task 6、Task 15 |
| §14 刷新实时性（批次 E） | Task 15 |

**2. 占位符扫描** —— 无 "TBD/TODO/实现细节后补"；所有代码步骤均给出可运行代码。唯一带条件分支的是 Task 15 Step 3 的 `blocking_recv` 可用性判定，已给出明确的兜底实现与验证方式（非占位符）。

**3. 类型一致性核对**
- `plan_formats(WriteInputs) -> Vec<FormatWrite>` 在 Task 3 定义、Task 3 测试与 `write_item_to_clipboard` 使用一致。
- `png_to_bmp24` 在 Task 2 定义、Task 3 的 `write_item_to_clipboard` 调用一致。
- `ClipboardBridge.write/getHtmlUrl/getRtfUrl/update/exportUrl/onChanged` 在 Task 5/11/12/15 定义与消费一致。
- `createUndoStack` 返回的 `current/push/undo/redo/canUndo/canRedo` 在 Task 13 定义、Task 14 使用一致。
- `clipboard-changed` / `clipboard.changed` 两个契约名在 Task 15 内一致（WS 用 `kind`，诊断用 `type`，与既有约定一致）。

**已知缺口（已消除）**：spec §8.3 的「富文本安全预览（`sandbox=""` iframe）」已作为 Task 10 Step 6 的一部分落地（取 `getHtmlUrl` → `srcDoc` → `sandbox=""`），无需额外任务。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-10-clipboard-history-enhancement.md`.
