# 剪贴板（Clipboard History）

> 左侧边栏「剪贴板」模块的交互说明。对应实现：`frontend/src/app/features/clipboard-history/`。

## 头部工具行

| 控件 | 交互 | 说明 |
|------|------|------|
| 标题 + 计数 | 静态 | 标题为「剪贴板」；计数 `role="status"`，**实时反映当前过滤后的可见条目数**（搜索/筛选生效时同步变化） |
| 清空按钮 | 点击 → 二次确认 | 删除范围 = **当前搜索结果与筛选结果**；未收窄时清空全部历史。悬停提示「清空全部」（收窄态「清空筛选结果」），确认框正文仍用完整范围描述 |
| 搜索按钮 | 点击切换 | 未激活时显示放大镜（悬停提示「搜索」）；激活后变为后退箭头，并在历史区域顶部展开搜索框 |
| 筛选按钮 | 点击展开菜单 | 显示「当前类型名 + 下拉图标」；菜单首项固定为「全部」，其余按实际存在的类型（固定类型序：文本、图片，未知类型按字典序）列出，**每项右侧显示该类型数量** |

清空 / 搜索 / 筛选三个按钮统一 2px 偏直角，悬停与键盘聚焦的灰底一致。

## 搜索模式

- 展开后在历史区域顶部渲染搜索框，选项：`Aa`（区分大小写）/ `ab`（全字匹配）/ `.*`（使用正则表达式）；**无替换功能**
- 语义与右侧面板「文件面板 → 检索文件」一致：非正则模式先转义、全字匹配包 `\b`、非法正则视为无结果、纯空白查询视为空查询
- 点击后退箭头收起搜索框（保留已输入的关键词，重新展开时恢复；收起状态下搜索词不参与过滤）

## 单条历史

| 元素 | 交互 |
|------|------|
| 徽章行 | 左侧类型徽章（文本/图片），右端相对时间戳（如「5 分钟前」）；**悬停行时时间戳隐藏，让位于行尾三按钮** |
| 整行 | 点击 → 打开**放大查看**（不再触发复制） |
| 行尾三按钮（竖排，自上而下） | ①删除本条 ②放大查看 ③复制；**仅悬停该行时出现**，贴合行右边缘，未悬停不占布局 |
| 复制按钮 | 文本条目复制文本；图片条目把落盘 PNG 写回系统剪贴板；图标有复制动画，成功后 Tooltip 变为「已复制到剪贴板」 |
| 删除按钮 | 删除该条（不触发放大查看） |

- 行高固定 72px（不随文本行数/图片尺寸变化），行间间距 2px，悬停背景贴合左右边缘
- 文本预览单行省略；缩略图固定 44×34（`object-fit: cover`）
- 悬停交互：未悬停时时间戳顶到最右；悬停时时间戳隐藏、三按钮出现，文本预览在按钮左侧截断（`padding-right` 切换为按钮列宽，按钮背景透明仅按钮自身悬停有底色）
- 首屏 30 条，每次再展开 30 条；滚动到距底 48px 内自动续页，「加载更多」按钮保留为键盘/无滚动场景入口
- 历史最多保留 500 条（`adl_clipboard::MAX_HISTORY_ITEMS`）；超出后启动/入库时淘汰最旧条目，并删除其图片、缩略图与 HTML/RTF 文件

## 放大查看覆盖层

- 文本条目：全文展示（保留换行），超过卡片高度时可滚动查看完整内容
- 文本 / 富文本预览：文本走 Markdown 渲染，富文本走沙箱 iframe；编辑与预览互斥
- 「自动换行」「预览」是持久化偏好（`adl:ui.clipboardViewerWrap` / `adl:ui.clipboardViewerPreview`），重开弹窗保持上次选择；图片与 RTF 没有预览面
- 头部与底部文本工具行的图标按钮使用系统原生 `title`（预览/保存的 title 为「预览」「保存」），`aria-label` 保留更具体的读屏名称
- 预览底色铺满整个内容区（`.adl-clipboard-viewer__body--active`）；Markdown 自身的 canvas 底色在弹窗内透明
- 预览排版与右侧文件/变更面板的 `.md` 预览一致（含 ≤760px 窄视口）：padding 由样式测试守护；关闭自动换行时用 `nowrap`，只禁折行、不放大段间距
- 图片条目：展示后端**原图**（`GET /clipboard/image/:filename`）；原图缺失/加载失败时依次回退到缩略图 → 图标占位
- 关闭方式：`Escape` / 点击遮罩 / 右上角 `×`；关闭后焦点归还打开它的行按钮
- 焦点陷阱：`Tab` 圈在覆盖层内（`aria-modal`）
- Tauri 模式：覆盖层已注册到 `shared/overlayManager.ts`（`OVERLAY_SELECTORS`），浏览器 WebView 会为其让位，避免 WebView2 原生表面覆盖模态框

## 清空确认对话框

- 标题按钮的 tooltip 随范围变化：未收窄 →「清空全部」；已收窄 →「清空筛选结果」；对话框标题与 `aria-label` 仍使用完整范围描述（如「清空全部剪贴板历史」）
- 正文按**用户真实操作**动态生成，例如：
  - `确定清空全部剪贴板历史？此操作不可恢复`
  - `确定清空搜索"good"和筛选类型为"文本"的剪贴板历史？此操作不可恢复`
  - `确定清空搜索"good"（区分大小写、使用正则表达式）和筛选类型为"图片"的剪贴板历史？此操作不可恢复`
- 说明文字为纯文本（无边框、无背景）
- 执行期间：三个按钮标记 `aria-disabled`（保留可聚焦性，避免焦点被浏览器移出模态框）+ `pointer-events: none`，重复提交被重入守卫忽略

## 滚动条

- 历史列表与查看器使用 `CustomScrollArea`（与右侧面板文件树同款）：7px 轨道、3px 滑块（悬停/拖拽时 5px）、仅在可滚动时浮现、支持拖拽

## 状态与数据

| 状态 | 存放位置 | 说明 |
|------|----------|------|
| `clipboardHistory` / `clipboardHistoryLoading` | `clipboardHistorySlice` | 列表数据，挂载时拉取一次；剪贴板变化走 `/ws/workspace` 推送，另以 10s 轮询兜底（页面隐藏时暂停） |
| `clipboardSearch` / `clipboardSearchOpen` | `clipboardHistorySlice` | 搜索词与搜索面板开合 |
| `clipboardMatchCase` / `MatchWholeWord` / `UseRegex` | `clipboardHistorySlice` | 搜索选项 |
| `clipboardKindFilter` | `clipboardHistorySlice` | 类型筛选（`'all'` 或具体 kind）；该类型条目被清空后自动回退 `'all'` |
| `viewerItem` / `filterOpen` / `confirmOpen` / `clearing` | 组件局部 state | 放大查看目标、筛选菜单、确认框、清空进行中 |

## 空态

| 条件 | 文案 |
|------|------|
| 历史为空 | 「暂无剪贴板历史」 |
| 历史非空但无匹配 | 「没有符合搜索和筛选条件的剪贴板历史」 |

## 测试

| 文件 | 覆盖 |
|------|------|
| `__tests__/clipboardFilter.test.ts` | 过滤管线、类型计数与排序、过滤入参组装 |
| `__tests__/clipboardClearScope.test.ts` | 清空范围描述（搜索/选项/筛选/组合/面板关闭/空白查询） |
| `__tests__/ClipboardHistoryHeader.test.tsx` | 计数、清空分支（全清 / 仅删可见）、动态文案、失效筛选回退、禁用态、菜单计数、键盘与焦点契约、清空进行中行为 |
| `__tests__/ClipboardHistoryList.test.tsx` | 空态区分、行渲染、计数下传、加载态、触底自动续页 |
| `__tests__/ClipboardItemRow.test.tsx` | 徽章/时间戳、行点击放大、复制（文本/图片）、删除、互斥路径 |
| `__tests__/ClipboardItemViewer.test.tsx` | 全文展示、Escape/遮罩关闭、Tab 陷阱与焦点归还、原图与三级回退、原生 title、换行/预览持久化、RTF 不进入预览面 |
| `../../styles/clipboard-viewer-markdown.test.ts` | 弹窗 Markdown padding 与右侧面板一致（含窄视口）、不铺 canvas 底色 |

## 相关文档

- 知识沉淀：[clipboard-history-panel-rework-2026-09-17.md](../../../knowledge-base/interaction/clipboard-history-panel-rework-2026-09-17.md)
