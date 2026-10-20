# dsh 版本来源与版本管理设计（2026-10-20）

## 背景

设置面板「DSH → 版本管理」当前存在三类问题：

1. **字段名不匹配**：后端 `VersionStatus` / `VersionInfo` / `VersionCatalog` 输出 snake_case，前端按 camelCase 读取，导致「检查更新」恒失败、当前版本不显示、发布时间缺失。
2. **来源优先级不可见且不可控**：`select_dsh_source` 固定为 运行中 > 系统安装 > 内置 > 下载（宿主管理）。存在系统安装时，版本管理里的安装/切换/卸载全部不改变实际运行的助手。
3. **按钮语义不真实**：安装只创建空目录并写 `selected.txt`，不下载；卸载只删空目录；重装不会重新下载。

用户已确认方向：

- 新增「版本来源」设置：自动检测 / 系统安装 / 宿主安装，默认自动检测。
- 实际来源为系统安装时，隐藏版本管理中的无效设置项。
- 安装/重装/卸载/切换当场真实执行，并接受自动重启正在运行的助手。
- 自动检测落到「无可用来源」时，不静默下载，提示并切换为「宿主安装」。

## 目标

- 版本来源可控、可解释，UI 与实际运行来源一致。
- 四个版本操作真实生效，不需要用户重启整个应用。
- 修复字段名与检查更新提示的确定性缺陷。
- 保持 Tauri 桌面与浏览器模式的 UI 行为一致：桌面走真实 ad-server 与真实安装，浏览器模式沿用现有 mock 桥（模拟同样的状态流转与成功/失败结果，不做真实下载）。

## 非目标

- 不改动系统全局安装的 dsh（不升级、不卸载）。
- 不实现版本目录的数据迁移；历史空目录视为「未安装」。
- 不引入 pnpm 等额外包管理器依赖。
- 不做增量/差分下载。

## 数据模型

### 版本来源偏好

`config/download-sources.json` 新增字段：

```json
{ "version_source": "auto" } // auto | system | host
```

- Rust：`DownloadSourceConfig.version_source: VersionSourceMode`，`#[serde(default)]` = `Auto`。
- 前端：`DshSourceConfig.version_source`，经现有 `/dsh/source-config` 保存、`/dsh/source-status` 读取。
- 名称与既有 `source_mode`（下载源自动/手动选择）区分，避免混淆。

### 实际来源

后端在 `source-status` 中返回：

```ts
versionSource: {
  mode: 'auto' | 'system' | 'host';
  effective: 'running' | 'host' | 'system' | 'bundled' | 'none';
  hostVersion: string | null;   // 宿主已选且完整的版本
}
```

`effective` 由纯函数 `resolve_version_source(mode, running, host, system, bundled)` 计算，便于离线单测。

### 自动检测优先级

1. **运行中**：3080 上通过指纹验证的 dsh。
2. **宿主安装**：`selected.txt` 指向的版本目录完整（存在 `node_modules/@deepseek-ai/dsh/lib/bin.js`）。
3. **系统安装**：PATH 中 `where dsh` 命中。
4. **内置**：`<数据根>/dsh-bundle/package/lib/bin.js` 存在。
5. **无**：不下载。前端提示并持久化切换 `version_source = host`，让安装项可见。

### 运行中探测收紧

`detect_running_dsh` 改为：

- 401 且响应体含 `dsh web authentication required`；或
- 2xx 且响应体含 `<title>DeepSeek Harness</title>`（兼容大小写/空白差异可用包含品牌名判定）。

其它 2xx 页面不再视为 dsh。端口被非 dsh 占用时沿用现有 `free_stale_dsh_on_default_port`：只杀命令行命中 dsh 的 PID，否则报错。

## 宿主版本安装

### 目录布局

```
<数据根>/dsh-versions/
├── selected.txt
└── installed/
    └── <version>/
        ├── package.json
        └── node_modules/@deepseek-ai/dsh/lib/bin.js
```

- `installed` 的判定：目录内 bin.js 存在。历史空目录不展示为已安装。
- 启动命令：`node <installed>/<version>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --no-open`。

### 安装流程

1. 校验 semver；读取下载源配置（registry / proxy）。
2. 在 `installed/.tmp-<version>-<nonce>` 执行：
   `npm install --prefix <tmp> --registry=<registry> --no-audit --no-fund --loglevel=error @deepseek-ai/dsh@<version>`
3. 校验 bin.js 存在；可选执行 `node bin.js --version` 验证可启动。
4. 原子替换：旧目录改名为 `.old-<nonce>` → 临时目录改名为正式目录 → 删除旧目录。
5. 失败：删除临时目录，保留旧版本；返回可读错误（截取 npm stderr 尾部，移除 registry 凭据）。
6. Windows 上 npm 可能以 `npm.cmd` 存在：沿用项目现有 `.cmd` 回退策略。
7. 代理：`manual` 时注入 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`；`none` 时移除代理变量；`auto` 时继承系统环境。

### 卸载

- 真删除 `installed/<version>`。
- 若卸载的是当前选中版本：按 semver 选剩余最高版本写回 `selected.txt`；没有剩余则清空。
- 需要时重启或停止助手（见下）。

### 切换

- 校验目标版本目录完整后写 `selected.txt`。
- 立即重启助手。

### 重装

- 沿用安装流程（临时目录 → 替换），成功后重启。

### 并发与锁

- 新增后端 `dsh_version_lock: Arc<AsyncMutex<()>>`，串行化安装/卸载/切换/重装。
- 前端继续用 `versionBusy` 禁用全部版本按钮。

## 立即生效与自动重启

新增 `POST /dsh/restart`，返回 `{ restarted: boolean, url: string | null }`：

1. 获取 `dsh_start_lock`。
2. 若 `dsh_state` 持有进程：kill + wait，清空。
3. 若 3080 仍被验证为 dsh 的外部进程占用：按 PID + 命令行验证后 kill，等待端口释放。
4. 清空 `dsh_source_cache`。
5. 按当前来源偏好重新解析并启动；来源为 `none` 时返回未启动。

前端版本操作成功后调用重启；若返回 URL：

- 通过显式前端动作把已有 dsh 浏览器标签导航到新 URL，或关闭旧标签后新建（不得依赖被动 URL 变化触发导航）。
- 无 URL 时提示「当前没有可用版本」。

## UI

### 版本管理块结构

1. **版本来源**（新增首行）：下拉 自动检测 / 系统安装 / 宿主安装 + 说明与提示图标。
2. **当前版本**：来源标签 + 版本/路径/URL；宿主版本带更新徽标；系统/内置显示来源说明。
3. **检查更新**、**正式版本**、**预发布版本**：仅在实际来源为 host / running / bundled / none 时显示。
4. **官方版本信息**：始终显示。

实际来源为 system 时：

- 隐藏 2–4 行中的管理项（检查更新、正式版、预发布）。
- 当前版本行显示 `系统安装（路径）`。
- 显示说明：「当前使用的是你自己安装的助手，本应用不会改动它。想在这里安装、切换或卸载版本，请把“版本来源”改为“宿主安装”。」

自动检测落到 none 时：

- 提示「没有找到可用的助手版本」，并自动切换到「宿主安装」。
- 展示安装入口与官方版本列表。

### 文案

- 「当前版本」问号提示重写为分层短句，面向普通用户，不出现 npm / npx / PATH / 端口 等术语，不在中文句中夹英文术语。
- 版本操作进度：`正在安装 {version}，首次安装可能需要几分钟`。
- 成功：`已安装 {version} 并切换到该版本`；`助手已自动重启`。
- 卸载当前版本：`已卸载 {version}，已切换到 {next}` / `已卸载 {version}，当前没有可用版本`。
- 错误：npm 缺失、网络失败、版本未发布、端口被非 dsh 占用分别给出可操作的说明。

## API / 类型变更

- `VersionStatus` / `VersionInfo` / `VersionCatalog`：加 `#[serde(rename_all = "camelCase")]`。
- `DshSourceStatus` 增加 `versionSource`。
- `DshSourceConfig` 增加 `version_source`。
- 新增 `POST /dsh/restart` 及 `DshBridge.restart()`；`httpBridge`（桌面 + 浏览器 preload 共用）与 `mock-bridge` 同步实现，`tauri-dsh` 透传。
- 版本操作仍返回版本串或布尔值，重启结果由 `/dsh/restart` 单独返回。

## 错误处理

| 场景 | 行为 |
|------|------|
| npm 不存在 | 安装失败，提示安装 Node.js 或改用系统/内置来源 |
| npm 安装失败/超时 | 保留旧版本，展示截断后的原因 |
| 版本未发布 | 安装前校验失败，不创建目录 |
| 端口被其它程序占用 | 不杀进程，提示关闭占用程序 |
| 重启失败 | 版本选择已保存，提示手动重新打开助手 |
| 自动检测无来源 | 不下载，切换为宿主安装并提示 |

## 测试

### Rust（离线）

- `resolve_version_source` 三种模式 × 四种可用来源的组合。
- 指纹判定：401 指纹、正确标题、普通 200 页面、空 body。
- `list_installed` 忽略空目录与非 semver 目录。
- 安装参数构造（registry / proxy / 版本）与 `.cmd` 回退选择。
- 卸载当前版本后的自动选择/清空。
- DTO 序列化键名（camelCase）。

### 前端（vitest）

- 来源选择持久化与三选项。
- effective=system 时隐藏管理项、保留说明。
- auto→none 时自动切换 host 并提示。
- 检查更新四种结果（失败 / 无正式版 / 有预发布 / 最新）。
- 四个按钮的忙碌态、成功/失败 toast、重启调用。
- 当前版本提示文案键存在且无硬编码。

### 手动（Tauri 桌面）

1. 自动检测 + 有系统安装：显示系统安装，隐藏管理项。
2. 切到宿主安装：显示列表，安装一个版本（1–3 分钟），当前版本变化。
3. 切换/重装/卸载：助手自动重启，标签地址更新。
4. 拔掉网络后安装：报错且旧版本保留。
5. 用其它程序占用 3080：打开助手时提示端口占用，不误杀。

## 影响范围

- `crates/download-source/src/lib.rs`
- `crates/dsh-version/src/lib.rs`
- `crates/server/src/handlers/dsh.rs`、`router.rs`、`state.rs`
- `crates/webapp-host`（如需复用 kill/spawn 辅助）
- `frontend/src/shared/ipc/dsh.ts`、`httpBridge.ts`、`tauri-bridge/tauri-dsh.ts`、`mock/mock-dsh.ts`
- `frontend/src/app/features/dsh/DshVersionManagement.tsx`、`DshSettings.tsx`
- `frontend/src/app/stores/actions/dshActions.ts`、`slices/dshSlice.ts`
- i18n `zh-CN/dsh.ts`、`en-US/dsh.ts`、i18n key 测试
- 文档：`CONTEXT.md`、DSH 相关手册、知识库

## 风险与已接受代价

- 每个宿主版本约 0.7 GB 磁盘、首次安装约 1–3 分钟（实测）。
- 自动重启会关闭用户在终端里手动启动的 dsh（仅限指纹/命令行验证为 dsh 的进程）。
- 无正式版时「检查更新」只报告预发布通道。
