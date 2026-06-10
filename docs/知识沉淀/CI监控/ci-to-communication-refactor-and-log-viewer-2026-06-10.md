# CI → 通信面板重构 + 日志查看器经验

> 来源：2026-06-10 CI 面板重构为通信面板、GitHub CI 日志查看器

## 1. 架构变更：CI → 通信面板

### 变更总结

| 维度 | 旧 (CI) | 新 (通信) |
|------|---------|-----------|
| ToolId | `ci` | `communicate` |
| 快捷键 | `Ctrl+Shift+Q` | `Ctrl+Shift+C` |
| 布局 | 单列 + 内标签页 | 平台 Tab + 左导航 + 右内容（三栏） |
| 子功能 | 仅 GitHub CI | GitHub + 飞书 + QQ + 微信 + 邮箱 |

### 核心文件

| 文件 | 职责 |
|------|------|
| `communicateSlice.ts` | 通信状态管理（平台选择、GitHub 子功能、日志缓存） |
| `CommunicationPanel.tsx` | 主容器，平台 Tab 切换 |
| `GitHubPanel.tsx` | GitHub CI 面板（Overview / Workflows / Jobs / Logs / Settings / Help） |
| `GitHubLogViewer.tsx` | 日志查看器组件（ANSI 渲染 + 虚拟滚动） |

### 样式规范

- 平台 Tab 使用 `--bg-hover` 作为悬停/激活态背景（与 ToolSwitcher 一致）
- 相邻悬停 Tab 之间显示 `var(--border-strong)` 分割线
- 所有图标使用 `currentColor` SVG，禁止 emoji

## 2. GitHub CI 日志查看器

### 后端（Rust）

```rust
// crates/ci-status/src/lib.rs
pub async fn fetch_job_logs(&self, config: &CiRepoConfig, run_id: u64)
    -> Result<HashMap<u64, String>, AppError>
```

**流程**：
1. 请求 `GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs`
2. GitHub 返回 ZIP 压缩包（以 `PK\x03\x04` 开头）
3. 使用 `zip` crate 在内存中解压
4. ZIP 内路径格式：`{run_id}/{job_name}/{step_num}_{step_name}.txt`
5. 按 `job_name` 分组，按 `step_num` 排序拼接
6. 通过 `fetch_jobs()` API 获取 `job_name → job_id` 映射
7. 返回 `HashMap<job_id, log_text>`

**缓存**：
- 使用 `lru::LruCache`（O(1) get/insert）
- max_entries = 10
- `get()` 同时提升 LRU 顺序

**安全**：
- 5MB 单 Job 截断上限（从末尾截断，保留最新日志）
- 非 ZIP 响应（错误 HTML）不会试图解压

### 前端组件

```typescript
// GitHubLogViewer.tsx
<GitHubLogViewer snapshot={snapshot} config={config} />
```

| 功能 | 技术方案 |
|------|----------|
| ANSI 颜色 | `ansi_up`（~5KB gzip） |
| 虚拟滚动 | `react-window` FixedSizeList，行高 20px |
| 行号 | 固定 60px 左侧区域 |
| 搜索 | 大小写不敏感，prev/next 导航 |
| 错误高亮 | 正则匹配 `error`/`fail`/`FAILURE`，左侧 3px 红色色条 |
| 空白折叠 | 连续 50+ 空白行合并为占位行 |
| Job 切换 | 下拉选择器，切换不同 Job 日志 |
| 数据获取 | `bridge.github.getJobLogs(config, runId)` |

### IPC 扩展

```typescript
// GitHubBridge 新增方法
getJobLogs: (config: CiRepoConfig, runId: number) => Promise<IpcResult<Record<number, string>>>
```

三端同步实现：tauri-bridge.ts（invoke）、preview-bridge/index.ts（POST）、mock-bridge.ts（mock）

### 浏览器模式

previewWorkspaceService.ts 新增 `POST /ci/status/job-logs` 端点，使用 `adm-zip` 解压 GitHub ZIP。三端一致性要求所有 IPC 方法必须同步实现。

## 3. 设计规范强制化

### 图标规范（design-system.md）

设计系统规则文件中已明确：
- **图标**：SVG 格式，继承 `currentColor`，禁止 emoji
- 违反示例：平台 Tab 曾使用 emoji，在 review 中被修正为 SVG

### 交互状态规范

| 状态 | Token |
|------|-------|
| 悬停 | `var(--bg-hover)` |
| 激活 | `var(--bg-hover)`（与悬停一致） |
| 分割线 | `var(--border-strong)` |

- 按钮在激活态和悬停态使用**相同**背景色，视觉效果一致
- 分割线仅当**相邻两个按钮**都处于高亮态时显示

## 4. Rust 编码规范补充

### LRU 缓存实现

```rust
// ✅ 使用 lru crate，O(1) 操作
use lru::LruCache;
use std::num::NonZeroUsize;

struct CiLogCache {
    inner: LruCache<u64, HashMap<u64, String>>,
}

impl CiLogCache {
    fn new(max_entries: usize) -> Self {
        let cap = NonZeroUsize::new(max_entries.max(1)).unwrap_or(NonZeroUsize::MIN);
        Self { inner: LruCache::new(cap) }
    }
}
```

- ❌ 手动 VecDeque + HashMap：`O(n)` 查找 + 非 LRU
- ✅ `lru::LruCache`：`O(1)` 操作 + 自动 LRU 淘汰

### ZIP 解压注意事项

```rust
// ✅ 先检查状态码，再读 bytes，最后验证 ZIP 头
let status = response.status();
if !status.is_success() {
    return Err(AppError::Network(format!("logs API returned {status}")));
}
let content = response.bytes().await?;
if !content.starts_with(b"PK\x03\x04") {
    warn!("not a ZIP: {:?}", preview);
    return Ok(HashMap::new());
}
```

- 错误 HTML 响应不能当 ZIP 解压
- ZIP 魔数检测（`PK\x03\x04`）是安全的做法

## 5. 数据流设计

```
用户点击「查看日志」按钮
  → setActiveGitHubSection('logs')
  → setSelectedLogJobId(jobId)
  → GitHubLogViewer useEffect 触发
  → cachedJobLogs[selectedLogJobId] 已缓存？
     → 是：跳过 fetch
     → 否：bridge.github.getJobLogs(config, runId)
          → Rust 后端：cache hit？
             → 是：返回缓存
             → 否：下载 ZIP → 解压 → 按 job_name 分组 → 映射 job_id → 缓存 → 返回
          → 前端：setCachedJobLogs(result.data)
  → ansi_up 渲染 → react-window 虚拟滚动
```

## 6. 相关文档

- [变更计划：CI 重构为通信面板](../../../.trae/documents/refactor-ci-to-communication.md)
- [GitHub CI 日志查看器计划](../../../.trae/documents/github-ci-log-viewer-plan.md)
- [UIOperationManual 通信面板](../../../UIOperationManual/rightpanel/tools/communicate.md)
