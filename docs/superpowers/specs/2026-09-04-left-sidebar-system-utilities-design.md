# 左侧边栏系统实用工具改造 — 剪贴板历史 + 系统状态监控

**日期**: 2026-09-04
**目标**: 在 dsh（DeepSeek Harness）接管中间区后，将项目左侧边栏从"工作区导航 + 快速访问"改造为两块系统级实用功能：**剪贴板历史**（系统剪贴板管理）+ **系统状态监控**（CPU/内存/磁盘/网络/进程只读 Top-N）。移除快速访问区（Skills/MCP）与 WorkspaceList。

## 1. 背景与范围

- **中间区**由 dsh 接管，dsh 自带"添加项目"与自身左侧边栏的会话管理。
- 因此本项目左侧边栏不再承担工作区/会话导航职责，改为系统实用工具。
- **GPU 采集本次不做**，也不预留占位文案/空位。
- UI/UX 与本项目现有设计系统、i18n、既有组件统一。

### 明确移除
| 项 | 位置 | 说明 |
|---|---|---|
| 快速访问区（Skills/MCP 两个 disabled 按钮） | `frontend/src/app/regions/LeftSidebar.tsx` | dsh 已内置 |
| WorkspaceList（工作区列表 + 右键菜单/拖拽/pin/新建入口） | `regions/left-sidebar/WorkspaceList.tsx` | 职责移交 dsh |

> ⚠️ 范围边界：本期仅移除**侧边栏 UI** 上的 WorkspaceList 与快速访问。底层 `workspaceSlice`、相关工作区 IPC 后端**保留不移除**，避免破坏 dsh 集成、右键 reveal 及仍引用 `currentWorkspace` 的其它功能。后端删除需另开任务评估。

## 2. 架构总览（双端一致性）

系统级能力统一放 Rust 后端，遵循三桥接一致性架构：

```
            ┌─────────────────────────────────────┐
            │  Frontend (React 19)                │
            │  LeftSidebar                        │
            │  ├─ ClipboardHistory 板块（剪贴板）    │
            │  └─ SystemMonitor 折叠分区（系统监控） │
            │  ├─ clipboardSlice / sysmonSlice     │
            │  └─ shared/ipc 定义                  │
            └──────────────┬──────────────────────┘
                    Tauri command / HTTP(ad-server)
            ┌──────────────┴──────────────────────┐
            │  Rust Backend                       │
            │  ├─ adl-clipboard 剪贴板服务          │
            │  │   （事件监听→SQLite→图片落盘→推送） │
            │  └─ adl-sysmon 系统监控服务           │
            │      （sysinfo 单实例→定时快照）      │
            └────────────────────────────────────┘
```

- 新增两个 `adl-` 前缀 crate：`adl-clipboard`、`adl-sysmon`，小而内聚、可独立测试。
- 桌面模式走 Tauri Command（`{domain}_{action}` 蛇形命名 + capability 授权）；浏览器预览走 ad-server HTTP handler（套 `run_blocking` + `ipc::to_response` 配方，请求体 `#[serde(rename_all="camelCase")]`）。
- 两端共用同一套 Rust 服务逻辑，保障双端一致。
- **剪贴板实时性**：桌面端用 Tauri 事件即时推送新条目；浏览器端复用既有"增量轮询"（`since_id`，同 `preview-pty-bridge` 思路）。系统监控两端统一 1s 轮询。

## 3. 剪贴板历史（adl-clipboard）

### 3.1 运行流程
```
系统剪贴板变化(事件监) → 去重合并 → 落库/图片落盘 → 推送前端
                                                   ├ 桌面：Tauri 事件
                                                   └ 浏览器：since_id 增量轮询
```

### 3.2 持久化（SQLite + 图片文件分离）
沿用既有存储层（`EntityTable` 模式），新增 `clipboard_items` 表；图片不塞 DB，落盘为 PNG + 缩略图，DB 只存路径/尺寸。

| 字段 | 说明 |
|---|---|
| `id` | 主键，自增 |
| `kind` | `text` / `image`（文字、表情、超长文本归 text；图片单独） |
| `content` | text 完整内容（超长文本完整保存） |
| `image_path` / `thumb_path` | image 类型时的 PNG 原图与缩略图路径 |
| `image_width` / `image_height` | 图片尺寸 |
| `source_app` | 来源应用（可选，利溯源） |
| `created_at` / `updated_at` | 时间戳 |

### 3.3 明确能力
- **无上限全记录**：不做条数/时间上限，隐私风险由用户自担（面板给一句本地存储提示文案即可，不做强制拦截）。
- **一键清空**：`DELETE` 全部记录 + 删除对应图片/缩略图文件，彻底清空不留痕。
- **单条删除**：删该行 + 其图片文件，硬删除。
- **删除不误删用户资产**：只删 App 数据目录 `clipboard/` 下的自建快照副本，绝不触碰用户原始文件（复制来源、磁盘上的原图等）。

### 3.4 工程细节
- **事件式监听**：`clipboard-win` 的 `monitor` feature（Windows `AddClipboardFormatListener`），优于轮询（省资源、少竞态）。
- **去重合并**：连续完全相同的复制不重复入库，仅更新时间戳（缓解双端同时运行时的重复写入）。
- **图片处理**：`image` crate 转 PNG + 生成小尺寸缩略图，避免 DB/内存膨胀。
- **超长文本**：DB 存完整；前端列表截断预览（不截断正文），展开/点击可见全文。
- **回写剪贴板**：点击历史项会用 `clipboard-win` setter 写回系统剪贴板（即"再次复制"）。

## 4. 系统监控（adl-sysmon）

### 4.1 数据流
后端常驻一个 `sysinfo::System` 单实例（官方建议，保性能），每 1s `refresh_specifics` 生成快照；前端两端统一 1s 轮询拉取。

### 4.2 指标快照结构
- 总览：CPU 总使用率、每核心使用率、内存/swap（已用/总量）、负载、开机时长
- 磁盘：每卷 总量/已用/可用
- 网络：每接口 上报/下载速率
- 进程：按 CPU/内存排序的 **Top-N（只读）**——名称/PID/占用/状态，含搜索

### 4.3 折叠分区交互
- 折叠态（底部）：紧凑卡片，仅 CPU + 内存迷你仪表/条，一眼可瞄。
- 展开态：完整面板——CPU/内存趋势曲线、磁盘、网络、进程 Top-N。
- GPU：本次不实现、无占位。

### 4.4 工程细节
- `refresh_specifics` 只取所需维度，避免全量刷新开销。
- 进程只取 Top-N 而非全量，控制每次 IPC 负载。

## 5. 前端 & 侧边栏改造

### 5.1 LeftSidebar 重构
自上而下：
1. **剪贴板历史板块**（主体，占主要可滚动区）
2. **系统监控折叠分区**（底部，默认折叠为 CPU+内存小卡片，点击展开完整面板）

### 5.2 剪贴板板块 UI
- 列表项按 `kind` 区分：文本（截断预览 + 语义/行数徽章，复用既有徽章样式）、图片（缩略图）。
- 顶部搜索框 + "一键清空"（二次确认）。
- 悬停单项出现"删除"按钮。
- 点击项回写系统剪贴板。

### 5.3 系统监控板块 UI
- 折叠小卡片与展开面板；曲线用设计系统配色/图标。
- 进程 Top-N 用既有紧凑列表/表格样式。

### 5.4 通用前端规范
- 全部文案走 **i18n**（新 key 归入相应领域字典）。
- 样式统一 `design-system` token；空状态用 `EmptyRow` 组件、无句号居中。
- 新增 Zustand 切片 `clipboardSlice`、`sysmonSlice`，遵循 action JSDoc 规范、`isFetching`/loading 字段规范、错误入队规范（`clearError` / `captureTypedError`）。

## 6. IPC / 桥接 / 权限 / 错误处理

### 6.1 shared/ipc 新增接口
`clipboard.list`、`clipboard.removeOne`、`clipboard.clearAll`、`clipboard.poll`（since_id 增量）、`sysmon.snapshot`。

### 6.2 三桥接同步实现
tauri-bridge（`invoke`）、preview-bridge（HTTP）、mock-bridge（mock 数据），返回统一 `IpcResult<T>`，错误用 `AppError`。

### 6.3 Tauri Command
按 `{domain}_{action}` 命名 + capability 授权（剪贴板读写需能力声明，含安全边界）。

### 6.4 Rust↔TS 类型
走 serde 双注解 + ts-rs 生成规范，新增共享类型进 kernel 桶。

### 6.5 错误/Loading
剪贴板是系统级敏感能力：IPC 错误（剪贴板被占用、无权限）统一结构化上报，不得静默吞掉；图片编解码失败有兜底日志；loading 字段入口置真、成功/失败置回。

## 7. 风险与边界
- **WorkspaceList 移除影响**：底层 workspace store / IPC 保留不移除（见 §1 范围边界）。
- **双端并发**：dev:both 双跑时剪贴板监听可能双跑 → 去重合并缓解。
- **浏览器端实时性**：无 Tauri 事件，靠 since_id 轮询，体验稍低但一致可行。
- **GPU / 高级指标**：明确不做，无占位。

## 8. 测试要点
- 剪贴板：监听入库、去重合并、图片落盘、单条/一键硬删除是否同时清 DB 与文件、回写。
- 系统监控：快照正确性、Top-N 排序、折叠/展开、1s 刷新、进程只读。
- 双端一致性：Tauri 与浏览器预览行为一致。
- UI：i18n 全覆盖、空状态居中无句号、Loading 状态。