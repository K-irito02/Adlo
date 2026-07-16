# CI 面板 UI/UX 优化与帮助文档设计

## 1. 概述与目标

本设计针对已实现的 CI 状态面板进行 UI/UX 优化和帮助文档集成，确保：
- 视觉风格与项目其他面板高度一致
- 适配深/浅主题
- 界面文字国际化（中英双语）
- 提供分层帮助系统（简洁弹窗 + 详细面板）

## 2. UI/UX 优化

### 2.1 现有问题
- 硬编码中文字符串（如"Quality Gates"、"触发者"、"SHA"）
- 使用内联 `<style>` 而非项目设计 Token
- CIPanelProps 通过 useCIPanelProps 注入，未统一获取 copy

### 2.2 优化方案

#### i18n 集成
- 在 `i18n/zh-CN/ci.ts` 和 `i18n/en-US/ci.ts` 添加 CI 相关翻译
- CIPanel 通过 `getAppCopy(state.appInfo)` 获取翻译
- 翻译 key 命名规范：`ci.*` 前缀

#### CSS 规范
- 复用项目设计 Token（`var(--text-*)`, `var(--surface-*)`, `var(--border)`）
- 移除内联 `<style>`，改用组件级别 CSS 文件
- 使用 `adl-ci__*` BEM 命名规范

#### 状态展示优化
- 保持现有状态颜色逻辑（`statusColor()` 函数）
- 使用 `adl-chip` 组件替代自定义样式

## 3. 分层帮助系统

### 3.1 方案A：浮动弹窗（基础）

**触发方式**：面板头部 `?` 按钮

**内容（基础使用）**：
| 模块 | 中文 | 英文 |
|------|------|------|
| 快速开始 | 输入 Owner/Repo/Branch → 点击查询 → 查看状态 | Enter Owner/Repo/Branch → Click Query → View Status |
| 状态指示 | 🟢 success=通过 🔴 failure=失败 🟡 in_progress=运行中 ⬜ skipped=跳过 | 🟢 success=Passed 🔴 failure=Failed 🟡 in_progress=Running ⬜ skipped=Skipped |
| 自动刷新 | 在终端执行 `git push` 成功后自动刷新（默认开启） | Auto-refreshes after `git push` in terminal (enabled by default) |
| 手动刷新 | 点击右上角刷新按钮 | Click the refresh button in the header |

**UI 规范**：
- 顶部滑出，宽度与面板一致
- 半透明遮罩背景
- 关闭按钮 + 点击遮罩关闭

### 3.2 方案B：面板内置 Tab（完整）

**结构**：
```
CI 面板
├── [状态] Tab（默认激活）
│   └── 现有 CI 状态展示
└── [帮助] Tab
    ├── 基础使用
    ├── 进阶概念
    └── 故障排查
```

**内容**：

#### 基础使用
| 章节 | 中文 | 英文 |
|------|------|------|
| 配置方法 | 输入 Owner（仓库所有者）、Repo（仓库名）、Branch（分支名，默认为 main），点击"查询"按钮。 | Enter Owner (repository owner), Repo (repository name), Branch (branch name, defaults to main), click "Query". |
| 状态颜色 | 绿色=通过、红色=失败、黄色=运行中、灰色=跳过 | Green=Passed, Red=Failed, Yellow=Running, Gray=Skipped |
| 查看日志 | 点击 Job 左侧箭头展开 Step，点击"在 GitHub 查看"跳转详情 | Click the arrow left of a Job to expand Steps; click "View on GitHub" for details |

#### 进阶概念
| 术语 | 专业定义（EN） | 通俗类比（EN） |
|------|---------------|----------------|
| Workflow | Top-level workflow defined in `.github/workflows/*.yml`, the entry point for GitHub Actions | The "master blueprint" of an assembly line, defining which stages run from start to finish |
| Job | Independent execution unit within a Workflow, can run in parallel or sequentially | A "work section" on the blueprint — sections can run simultaneously or in sequence |
| Step | Individual operation within a Job (Shell command or another Action) | A "specific action" within a work section, like "polishing" or "painting" |
| Run | A single execution instance of a Workflow | One "actual run" of the assembly line, triggered by each push |
| Conclusion | Final result of a Job/Step: success/failure/skipped/cancelled | "Acceptance result" after a stage completes |
| Status | Real-time state: queued/in_progress/completed | "Current operation state" of the assembly line |

#### 故障排查
| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 显示"暂无 Workflow Runs" | 仓库没有 Actions，或分支没有触发 Workflow | 检查 `.github/workflows/` 目录是否存在 workflow 文件，或尝试执行一次 push |
| Rate limit exceeded | GitHub API 无认证限制（无 token 60 req/hr） | 等待一小时后重试，或配置 GitHub Personal Access Token |
| 状态未自动刷新 | 终端未检测到 push，或自动刷新已关闭 | 检查终端是否有 push 输出，或手动点击刷新按钮 |
| 信息显示不完整 | 公开仓库 API 限制，部分信息隐藏 | 配置 GitHub Token 以获取完整信息 |
| 私有仓库查询失败 | 未配置 Token 或 Token 权限不足 | 配置具有 `repo` scope 的 GitHub Personal Access Token |

#### GitHub Personal Access Token 获取指南

**为什么需要 Token？**

| 场景 | 无 Token | 有 Token |
|------|----------|----------|
| Rate Limit | 60 次/小时（匿名） | 5,000 次/小时（认证用户） |
| 私有仓库 | ❌ 无法访问 | ✅ 可访问 |
| 公开仓库 | ✅ 可访问 | ✅ 可访问（完整信息） |

**所需权限（Minimum Scopes）**：

| Scope | 用途 | 说明 |
|-------|------|------|
| `repo` (完整) | 查询私有仓库 CI 状态 | 需要访问私有仓库 |
| `public_repo` | 仅查询公开仓库 | 不需要访问私有仓库 |

> ⚠️ 安全提示：如果只需要查询公开仓库，建议只勾选 `public_repo` scope，以最小化权限暴露。

**创建步骤**：

1. **登录 GitHub**：访问 https://github.com 并登录你的账号

2. **进入设置页面**：点击右上角头像 → **Settings**（设置）

3. **导航到开发者设置**：
   - 在左侧菜单底部找到 **Developer settings**（开发者设置）

4. **创建 Personal Access Token**：
   - 选择 **Personal access tokens** → **Fine-grained tokens**（细粒度令牌）
   - 点击 **Generate new token**（生成新令牌）

5. **配置令牌权限**：

   **方式A：细粒度令牌（推荐）**
   - **Token name**：填写令牌名称，如 `AI-Digital-Life-CI`
   - **Expiration**：设置过期时间，建议 30-90 天
   - **Resource owner**：选择你的个人账号或组织
   - **Repository access**：选择需要访问的仓库，或"All repositories"
   - **Permissions**：
     - 点击 **Repository permissions**
     - 搜索并添加 **Actions** 权限，设置为 **Read-only**

   **方式B：经典令牌（兼容性更强）**
   - **Token name**：填写令牌名称，如 `AI-Digital-Life-CI`
   - **Expiration**：设置过期时间
   - **Select scopes**：勾选以下权限
     - ✅ `repo` (Full control of private repositories) — 如果需要访问私有仓库
     - 或 ✅ `public_repo` (Access public repositories only) — 仅公开仓库
     - ✅ `read:user` (Read user profile data)

6. **生成并保存 Token**：
   - 点击 **Generate token**（生成令牌）
   - **⚠️ 重要**：立即复制 Token 并保存到安全位置
   - GitHub 只显示一次 Token，刷新页面后将无法查看

7. **在应用中配置 Token**：
   - 打开应用 → 进入 CI 面板
   - 在 Token 输入框中粘贴 Token
   - Token 将保存在本地（安全存储），下次启动自动加载

**安全说明**：

- ✅ Token 仅保存在你的设备本地（不上传至任何服务器）
- ✅ Tauri 桌面模式：使用系统钥匙串（如 Windows Credential Manager）安全存储
- ✅ 浏览器开发模式：保存在浏览器 localStorage
- ❌ 不要将 Token 提交到代码仓库
- ❌ 不要在公开场合分享 Token

**撤销/更换 Token**：

如果 Token 泄露或不再需要，可以在 GitHub Developer settings 中：
1. 找到对应的 Token
2. 点击 **Delete**（删除）
3. 或点击 **Regenerate token**（重新生成）并更新应用中的 Token

## 4. 组件结构

```
CIPanel (根组件)
├── CIPanelTabs (Tab 切换：状态/帮助)
├── CIPanelStatus (状态 Tab 内容)
│   ├── CIPanelConfig (配置区)
│   ├── CIPanelSummary (运行摘要)
│   ├── CIPanelJobs (Job 列表)
│   └── CIPanelEmpty (空状态)
├── CIPanelHelp (帮助 Tab 内容)
│   ├── CIPanelHelpQuickStart (快速开始)
│   ├── CIPanelHelpConcepts (进阶概念)
│   └── CIPanelHelpTroubleshooting (故障排查)
└── CIPanelTooltip (浮动弹窗，方案A)
```

## 5. i18n 翻译 Key

```typescript
// zh-CN/ci.ts / en-US/ci.ts
export const ciZh = {
  // 面板标题
  ciPanelTitle: 'Quality Gates',
  ciPanelTitleEn: 'Quality Gates',

  // 配置区
  ciOwnerPlaceholder: 'Owner (e.g. your-username)',
  ciRepoPlaceholder: 'Repo (e.g. my-repo)',
  ciBranchPlaceholder: 'Branch (default: main)',
  ciQueryButton: '查询',
  ciQueryButtonEn: 'Query',

  // 元数据标签
  ciTriggeredBy: '触发者',
  ciTriggeredByEn: 'Triggered by',
  ciEvent: '事件',
  ciEventEn: 'Event',
  ciSha: 'SHA',
  ciStartedAt: '开始',
  ciStartedAtEn: 'Started',
  ciViewOnGithub: '在 GitHub 查看',
  ciViewOnGithubEn: 'View on GitHub',

  // Jobs
  ciJobsTitle: 'Jobs',
  ciNoWorkflowRuns: '暂无 Workflow Runs',
  ciNoWorkflowRunsHint: '在 {branch} 分支上没有找到最近的运行记录',
  ciNoWorkflowRunsHintEn: 'No recent runs found on branch {branch}',

  // 空状态
  ciConfigToQuery: '配置仓库以查询 Quality Gates',
  ciConfigToQueryHint: '输入 Owner/Repo/Branch 后点击"查询"',
  ciConfigToQueryHintEn: 'Enter Owner/Repo/Branch and click "Query"',

  // Tab
  ciTabStatus: '状态',
  ciTabStatusEn: 'Status',
  ciTabHelp: '帮助',
  ciTabHelpEn: 'Help',

  // 方案A Tooltip
  ciTooltipQuickStart: '快速开始',
  ciTooltipQuickStartEn: 'Quick Start',
  ciTooltipAutoRefresh: '自动刷新',
  ciTooltipAutoRefreshEn: 'Auto-refresh',
  ciTooltipManualRefresh: '手动刷新',
  ciTooltipManualRefreshEn: 'Manual Refresh',

  // 帮助Tab - 基础
  ciHelpBasicTitle: '基础使用',
  ciHelpBasicTitleEn: 'Basic Usage',
  ciHelpHowToConfig: '配置方法',
  ciHelpHowToConfigEn: 'How to Configure',
  ciHelpHowToViewLogs: '查看日志',
  ciHelpHowToViewLogsEn: 'How to View Logs',

  // 帮助Tab - 概念
  ciHelpConceptsTitle: '进阶概念',
  ciHelpConceptsTitleEn: 'Advanced Concepts',
  ciHelpConceptWorkflow: 'Workflow',
  ciHelpConceptJob: 'Job',
  ciHelpConceptStep: 'Step',
  ciHelpConceptRun: 'Run',
  ciHelpConceptConclusion: 'Conclusion',
  ciHelpConceptStatus: 'Status',

  // 帮助Tab - 故障排查
  ciHelpTroubleshootingTitle: '故障排查',
  ciHelpTroubleshootingTitleEn: 'Troubleshooting',
  ciHelpNoRuns: '暂无 Workflow Runs',
  ciHelpRateLimit: 'Rate limit exceeded',
  ciHelpNoAutoRefresh: '状态未自动刷新',
  ciHelpNoAutoRefreshEn: 'Status not auto-refreshing',
  ciHelpIncompleteInfo: '信息显示不完整',
  ciHelpIncompleteInfoEn: 'Incomplete information displayed',

  // 错误
  ciErrorTitle: '错误',
  ciErrorTitleEn: 'Error',
  ciErrorPleaseConfigFirst: '请先配置仓库 owner 和 repo',
  ciErrorPleaseConfigFirstEn: 'Please configure owner and repo first',
} as const;
```

## 6. 深浅主题适配

所有颜色使用 CSS Variable：
```css
--text-primary, --text-secondary, --text-tertiary
--surface-primary, --surface-secondary, --surface-hover
--border
--link
--success, --danger, --warning
```

## 7. 实施计划

### Phase 1: i18n 国际化
1. 创建 `i18n/zh-CN/ci.ts` 和 `i18n/en-US/ci.ts`
2. 更新 `i18n/zh-CN/index.ts` 和 `i18n/en-US/index.ts` 合并
3. 重构 CIPanel 使用 `getAppCopy()`

### Phase 2: UI/UX 优化
1. 迁移内联 styles 到 CSS 文件或 design token
2. 使用 `adl-chip` 等项目组件
3. 优化布局和间距

### Phase 3: 帮助系统
1. 创建 CIPanelTabs 组件（状态/帮助 Tab）
2. 实现 CIPanelHelp 组件（方案B）
3. 实现 CIPanelTooltip 组件（方案A）
4. 添加 `?` 帮助按钮
