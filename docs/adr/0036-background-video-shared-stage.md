# 0036 着陆页视频背景：单一解码 + canvas 镜像

- Status: Accepted
- Date: 2026-11-26
- Domain: 浏览器与预览

## Context

着陆页（新建标签页）可能同时在右侧面板、中心区与自定义背景弹窗中出现多份。视频背景若各自持有
`<video>`：

- 多个解码器同时运行，占用 CPU/GPU；
- 进度不同步（各自 `currentTime`），音频可能叠在一起；
- 切换面板/中心标签后，元素被卸载或 `autoplay` 被拒，视频停住、进度丢失；
- 弹窗里预览的“已应用视频”与背景不是同一路，调音量不同步。

用户要求：无论面板/中心/多个新建标签页，进度与音频一致；隐藏时后台继续播放但静音。

## Decision

1. **唯一解码源**：模块级常驻隐藏 `<video>`（`backgroundVideoStage.ts`，2×2、屏外），负责解码、
   进度、音频；页面没有着陆页 surface 时释放解码（pause + 清 src）。
2. **canvas 镜像**：每个可见 surface 只渲染 `<canvas>`，单一 rAF（上限约 30fps）从主视频
   `drawImage`；cover/contain 与自由调整在 canvas 内完成，外层容器只负责裁剪。
3. **素材指纹**：`assetPath / assetId / filePath` 生成 stage key；同一素材的多个 surface（含弹窗预览）
   不重复换源，保证进度连续。弹窗中“已应用的视频”用同源 canvas 镜像，音量写回配置。
4. **音频仲裁**：任一 surface 可见且窗口可见时按配置音量出声；全部隐藏或窗口不可见时静音，
   但主视频继续播放。surface 注销时重新判定，避免后台残留声音。
5. **素材托管**：桌面复制到应用数据目录 `adl-backgrounds/` + asset 协议；浏览器 IndexedDB +
   object URL；不使用 data URL，不设业务层大小上限。

## Alternatives considered

- **单 `<video>` 元素在 surface 之间移动**：进度/音频天然一致，但同一时刻只能在一个位置显示，
  两处同时可见时另一处只能占位；移动播放中的元素在 WebView2 下有暂停/重载风险。
- **主时钟 + 多静音镜像 `<video>`**：可多处显示，但需要定期 `currentTime` 纠偏，画面只能近似同步，
  且仍是多解码器。
- **canvas 镜像（本决策）**：单一解码、单一音频、帧级一致；代价是全屏 canvas 绘制（约 30fps），
  已通过限帧与可见面才绘制控制。

## Consequences

- 视频背景的进度/音频在面板、中心、弹窗之间一致；切走再回来进度连续。
- 隐藏时仍占用一路解码（用户明确要求后台播放），必要时由用户切走页面或重置背景释放。
- 任何新增“显示着陆页”的位置必须使用 `<BackgroundVideoCanvas>` 并传 stage key，不能直接放 `<video>`。
- 平铺只对图片生效；视频只提供铺满/适应。
