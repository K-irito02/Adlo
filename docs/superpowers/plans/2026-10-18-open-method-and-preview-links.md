# 预览链接交互 + 「打开方式」设置组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让文件/变更面板的 Markdown 预览正文链接（章节导航 / 文件索引 / 网址链接）可点击并按统一规则打开，并新增「打开方式」设置组（网址落点 / 文件落点 / 智能体站点链接拦截 + 白名单）。

**Architecture:** 三层——设置层（Rust `AppPreferencePatch`/`ConfigSnapshot` 持久化，前端通用 `SettingItem` 渲染）、打开执行层（前端统一 `openUrlByMethod`/`openFileByMethod`）、链接识别层（① Markdown 预览 DOM 事件委托；② Tauri WebView2 注入脚本 agent 分支 → postMessage → Rust 事件 → 前端）。两个入口复用同一对打开动作。

**Tech Stack:** Rust (Tauri 2.x, serde, ts-rs) + React 19 + TypeScript + Zustand + markdown-it + Vitest + webview2-com。

**Spec:** `docs/superpowers/specs/2026-10-18-open-method-and-preview-links-design.md`

## Global Constraints

- 前端命令：包管理 pnpm；Rust 用 Cargo。工作目录：Rust 命令在 `ai-digital-life/`，git 在仓库根。
- Rust lint：`cargo clippy --workspace --all-targets -- -D warnings`（必须 0 警告）。
- 前端 lint：`pnpm --dir frontend run lint`（= `npx eslint . && npx tsc --noEmit`，0 error）。
- 前端测试：`pnpm --dir frontend run test`（Vitest）；Rust 测试：`cargo test -p <crate>`。
- i18n：任何 UI 展示文本禁止硬编码，必须加 key；`zh-CN` 是 `CopyKey` 真源，`en-US` 逐 key 对齐。
- 新增 Tauri 命令必须**同时**登记到 `src-tauri/src/main.rs` 的 `generate_handler![]` 与 `src-tauri/permissions/digital-life.toml` 的 `commands.allow`（`main.rs` 有测试锁定二者一致）。
- 禁止向后兼容/旧数据迁移代码（未发布阶段）。
- 默认值单一来源：`linkOpenMethod='panel'`、`fileOpenMethod='panel'`、`agentLinkIntercept=false`、`agentSiteWhitelist=[]`。
- 提交只在用户明确要求时执行；每个 Task 的「Commit」步骤仅作规范建议，执行者须先获得用户/编排者许可。

---

## File Structure

**Rust**
- Modify `crates/types/src/types/config.rs` — 新增枚举 `LinkOpenMethod`/`FileOpenMethod`；`AppPreferencePatch` + `ConfigSnapshot` 增 4 字段。
- Modify `crates/kernel/src/config.rs` — `AppConfig` 增 4 字段 + 默认 + `apply_patch`。
- Modify `crates/kernel/src/app_info.rs` — 快照映射。
- Modify `crates/types/src/types/mod.rs` — 测试用配置字面量补字段。
- Modify `crates/browser/src/browser_navigation.rs` — 新增 `init_script_with_background_and_agent`。
- Modify `crates/browser/src/init_script.js` — agent-host 链接拦截分支。
- Modify `crates/browser/src/webview_handle.rs` — `WebView2EventBridge` 增 `emit_agent_link`（默认空实现）。
- Modify `crates/browser/src/meta_cache_bridge.rs` — 默认实现已由 trait 默认提供，无需改（确认）。
- Modify `crates/browser/src/webview2_postmessage.rs` — 解析 `adl-agent-link`。
- Modify `crates/browser/src/webview2_message.rs` — 若有转发通道，确认 postMessage 处理入口。
- Modify `crates/browser/src/browser_webview.rs` — `BrowserManager::set_agent_intercept_for_all`。
- Modify `src-tauri/src/commands/browser.rs` — `browser_create_for_tab` 增 2 参；新增 `browser_set_agent_intercept`。
- Modify `src-tauri/src/commands/browser_webview_setup.rs` — `build_webview_builder` 传 agent 参数；bridge `emit_agent_link` 实现。
- Modify `src-tauri/src/main.rs` — 注册新命令。
- Modify `src-tauri/permissions/digital-life.toml` — 登记新命令。

**Frontend**
- Modify `frontend/src/shared/ipc-types.generated.ts` — TS 类型同步。
- Modify `frontend/src/shared/preferencesMerger.ts`、`frontend/src/shared/defaultPreferences.ts`。
- Create `frontend/src/shared/originWhitelist.ts`（origin 归一/校验）。
- Modify `frontend/src/kernel/types.ts` — `SettingsGroupId` += `'openMethod'`；`SettingItem.type` += `'originlist'`。
- Modify `frontend/src/app/utils/settingsViewModel.ts` — 新增 4 个 SettingItem + patch 映射。
- Create `frontend/src/app/components/settings/OriginListControl.tsx`。
- Modify `frontend/src/app/components/settings/SettingsControls.tsx` — 渲染 `originlist`。
- Modify `frontend/src/app/components/settings/settingsGroups.ts` — 组 + 重置。
- Modify `frontend/src/app/i18n/zh-CN/settings.ts` + `frontend/src/app/i18n/en-US/settings.ts`。
- Create `frontend/src/app/features/preview/openByMethod.ts`（打开执行层）。
- Modify `frontend/src/app/features/preview/markdownPreviewUtils.ts` — 标题 slug id。
- Modify `frontend/src/app/features/preview/MarkdownPreview.tsx` — 点击委托 + props。
- Modify `frontend/src/app/regions/right-panel/FilePreviewRenderers.tsx` + `frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx` — 注入 linkHandlers。
- Create `frontend/src/app/features/browser/useBrowserAgentLinkSubscription.ts`。
- Modify `frontend/src/shared/ipc/browser.ts` + `tauri-bridge/tauri-browser.ts` + `mock/mock-browser.ts` + `preview-bridge/index.ts` + `httpBridge.ts` — `onAgentLink`。

**Tests**
- Rust：`crates/kernel/src/config.rs`（新增用例）、`crates/kernel/src/app_info.rs`、`crates/browser/src/webview2_postmessage.rs`、`crates/browser/src/browser_webview.rs`。
- 前端：`shared/preferencesMerger.test.ts`、`shared/originWhitelist.test.ts`、`app/features/preview/MarkdownPreview.test.ts`（改）、`app/features/preview/__tests__/MarkdownPreview.test.tsx`（增）、`app/features/preview/__tests__/openByMethod.test.ts`、`app/features/browser/initScriptNavigation.test.ts`（增）、`app/components/settings/SettingsPanel.test.tsx`（增）。

---

## Task 1: Rust 偏好数据模型

**Files:**
- Modify: `crates/types/src/types/config.rs`
- Modify: `crates/kernel/src/config.rs`
- Modify: `crates/kernel/src/app_info.rs`
- Modify: `crates/types/src/types/mod.rs:128`（测试字面量）

**Interfaces:**
- Produces: `LinkOpenMethod { Middle, Panel, External }`、`FileOpenMethod { Panel, External }`（均 `Default`）；`AppPreferencePatch.{link_open_method,file_open_method,agent_link_intercept,agent_site_whitelist}`；`ConfigSnapshot` 同名 4 字段；`AppConfig` 同名 4 字段。

- [ ] **Step 1: 写失败测试（kernel config 默认 + patch）**

在 `crates/kernel/src/config.rs` 的 `mod tests` 内追加：

```rust
#[test]
fn open_method_and_agent_defaults() {
    let c = AppConfig::default();
    assert_eq!(c.link_open_method, adl_types::types::config::LinkOpenMethod::Panel);
    assert_eq!(c.file_open_method, adl_types::types::config::FileOpenMethod::Panel);
    assert!(!c.agent_link_intercept);
    assert!(c.agent_site_whitelist.is_empty());
}

#[test]
fn apply_patch_sets_open_method_and_agent_fields() {
    use adl_types::types::config::{FileOpenMethod, LinkOpenMethod};
    let mut c = AppConfig::default();
    c.apply_patch(&AppPreferencePatch {
        link_open_method: Some(LinkOpenMethod::External),
        file_open_method: Some(FileOpenMethod::External),
        agent_link_intercept: Some(true),
        agent_site_whitelist: Some(vec!["http://127.0.0.1:3080".into()]),
        ..Default::default()
    });
    assert_eq!(c.link_open_method, LinkOpenMethod::External);
    assert_eq!(c.file_open_method, FileOpenMethod::External);
    assert!(c.agent_link_intercept);
    assert_eq!(c.agent_site_whitelist, vec!["http://127.0.0.1:3080".to_string()]);
}

#[test]
fn old_config_without_open_method_fields_loads_with_defaults() {
    let dir = temp_dir().join("adl-config-open-method-old");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("config")).unwrap();
    let old_json = r#"{"language":"zh-CN","theme_mode":"system","log_level":"info","terminal_log_mode":"overwrite","debug_log_mode":"overwrite","max_recent_workspaces":10}"#;
    std::fs::write(config_path_for(&dir), old_json).unwrap();
    let loaded = load_from(&dir).unwrap();
    assert_eq!(loaded.link_open_method, adl_types::types::config::LinkOpenMethod::Panel);
    assert!(loaded.agent_site_whitelist.is_empty());
    let _ = std::fs::remove_dir_all(&dir);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-kernel --lib config::`
Expected: 编译失败（`link_open_method` 字段不存在）。

- [ ] **Step 3: 加枚举与 patch 字段（`crates/types/src/types/config.rs`）**

在 `ThemeMode` 定义之后追加：

```rust
/// 网址链接的默认打开落点。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "lowercase")]
pub enum LinkOpenMethod {
    Middle,
    #[default]
    Panel,
    External,
}

/// 本地文件的默认打开方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "lowercase")]
pub enum FileOpenMethod {
    #[default]
    Panel,
    External,
}
```

在 `AppPreferencePatch` 末尾（`browser_inactive_tab_suspend_ms` 之后）追加：

```rust
    #[ts(optional)]
    pub link_open_method: Option<LinkOpenMethod>,
    #[ts(optional)]
    pub file_open_method: Option<FileOpenMethod>,
    #[ts(optional)]
    pub agent_link_intercept: Option<bool>,
    #[ts(optional)]
    pub agent_site_whitelist: Option<Vec<String>>,
```

在 `ConfigSnapshot` 末尾（`browser_inactive_tab_suspend_ms` 之后）追加：

```rust
    #[serde(default)]
    pub link_open_method: LinkOpenMethod,
    #[serde(default)]
    pub file_open_method: FileOpenMethod,
    #[serde(default)]
    pub agent_link_intercept: bool,
    #[serde(default)]
    pub agent_site_whitelist: Vec<String>,
```

- [ ] **Step 4: 加 AppConfig 字段 + 默认 + apply_patch（`crates/kernel/src/config.rs`）**

`use` 行：`use adl_types::types::config::{AppPreferencePatch, FileOpenMethod, LinkOpenMethod, LogLevel};`

`AppConfig` 结构体末尾追加：

```rust
    /// 网址链接默认打开落点（提前/相对于面板/外部浏览器）。
    #[serde(default)]
    pub link_open_method: LinkOpenMethod,
    /// 本地文件默认打开方式（文件面板/系统默认应用）。
    #[serde(default)]
    pub file_open_method: FileOpenMethod,
    /// 智能体站点正文链接拦截开关。
    #[serde(default)]
    pub agent_link_intercept: bool,
    /// 需拦截的智能体站点 origin 白名单（整站匹配）。
    #[serde(default)]
    pub agent_site_whitelist: Vec<String>,
```

`apply_patch` 末尾追加：

```rust
        if let Some(v) = patch.link_open_method {
            self.link_open_method = v;
        }
        if let Some(v) = patch.file_open_method {
            self.file_open_method = v;
        }
        if let Some(v) = patch.agent_link_intercept {
            self.agent_link_intercept = v;
        }
        if let Some(v) = patch.agent_site_whitelist.as_ref() {
            self.agent_site_whitelist = v.clone();
        }
```

`Default for AppConfig` 末尾追加：

```rust
            link_open_method: LinkOpenMethod::default(),
            file_open_method: FileOpenMethod::default(),
            agent_link_intercept: false,
            agent_site_whitelist: Vec::new(),
```

- [ ] **Step 5: 快照映射（`crates/kernel/src/app_info.rs`）**

`ConfigSnapshot { ... }` 末尾追加：

```rust
            link_open_method: config.link_open_method,
            file_open_method: config.file_open_method,
            agent_link_intercept: config.agent_link_intercept,
            agent_site_whitelist: config.agent_site_whitelist.clone(),
```

- [ ] **Step 6: 修 `crates/types/src/types/mod.rs` 测试字面量**

在 `browser_inactive_tab_suspend_ms: 3_600_000,` 之后补：

```rust
                link_open_method: Default::default(),
                file_open_method: Default::default(),
                agent_link_intercept: false,
                agent_site_whitelist: vec![],
```

（若该处是 `ConfigSnapshot` 字面量则用 `Default::default()`；若是 `AppConfig` 同理。）

- [ ] **Step 7: 运行测试 + clippy**

Run: `cargo test -p adl-kernel -p adl-types --lib`
Expected: PASS。
Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 警告。

- [ ] **Step 8: Commit**

```bash
git add crates/types/src/types/config.rs crates/types/src/types/mod.rs crates/kernel/src/config.rs crates/kernel/src/app_info.rs
git commit -m "feat(settings): add open-method and agent-intercept preferences to config"
```

---

## Task 2: 前端偏好类型 / 合并 / 默认值

**Files:**
- Modify: `frontend/src/shared/ipc-types.generated.ts`
- Modify: `frontend/src/shared/preferencesMerger.ts`
- Modify: `frontend/src/shared/defaultPreferences.ts`
- Test: `frontend/src/shared/preferencesMerger.test.ts`

**Interfaces:**
- Consumes: Task 1 的 Rust 字段名。
- Produces: TS `LinkOpenMethod`/`FileOpenMethod`；`DEFAULT_LINK_OPEN_METHOD` 等常量；合并分支。

- [ ] **Step 1: 写失败测试（preferencesMerger）**

在 `frontend/src/shared/preferencesMerger.test.ts` 追加：

```ts
it('merges open-method and agent-intercept fields', () => {
  const base = { ...snapshotBase }; // 复用文件内已有的 config 快照夹具
  const merged = applyPreferencePatch(base, {
    linkOpenMethod: 'external',
    fileOpenMethod: 'external',
    agentLinkIntercept: true,
    agentSiteWhitelist: ['http://127.0.0.1:3080'],
  });
  expect(merged.linkOpenMethod).toBe('external');
  expect(merged.fileOpenMethod).toBe('external');
  expect(merged.agentLinkIntercept).toBe(true);
  expect(merged.agentSiteWhitelist).toEqual(['http://127.0.0.1:3080']);
});
```

（若文件无 `snapshotBase`，用同文件已有夹具变量名替换。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- preferencesMerger`
Expected: FAIL（字段不存在 / 类型错误）。

- [ ] **Step 3: 同步 TS 类型（`frontend/src/shared/ipc-types.generated.ts`）**

顶部类型区追加：

```ts
export type LinkOpenMethod = "middle" | "panel" | "external";
export type FileOpenMethod = "panel" | "external";
```

`AppPreferencePatch` 末尾追加：

```ts
  linkOpenMethod?: LinkOpenMethod;
  fileOpenMethod?: FileOpenMethod;
  agentLinkIntercept?: boolean;
  agentSiteWhitelist?: string[];
```

`ConfigSnapshot` 末尾追加：

```ts
  linkOpenMethod: LinkOpenMethod;
  fileOpenMethod: FileOpenMethod;
  agentLinkIntercept: boolean;
  agentSiteWhitelist: string[];
```

- [ ] **Step 4: 合并分支（`frontend/src/shared/preferencesMerger.ts`）**

在 `browserInactiveTabSuspendMs` 分支后追加：

```ts
  if (patch.linkOpenMethod !== undefined) {
    nextConfig.linkOpenMethod = patch.linkOpenMethod;
  }
  if (patch.fileOpenMethod !== undefined) {
    nextConfig.fileOpenMethod = patch.fileOpenMethod;
  }
  if (patch.agentLinkIntercept !== undefined) {
    nextConfig.agentLinkIntercept = patch.agentLinkIntercept;
  }
  if (patch.agentSiteWhitelist !== undefined) {
    nextConfig.agentSiteWhitelist = patch.agentSiteWhitelist;
  }
```

- [ ] **Step 5: 默认值（`frontend/src/shared/defaultPreferences.ts`）**

常量区追加：

```ts
export const DEFAULT_LINK_OPEN_METHOD = 'panel' as const;
export const DEFAULT_FILE_OPEN_METHOD = 'panel' as const;
export const DEFAULT_AGENT_LINK_INTERCEPT = false;
export const DEFAULT_AGENT_SITE_WHITELIST: string[] = [];
```

`getDefaultPreferences()` 返回值追加：

```ts
    linkOpenMethod: DEFAULT_LINK_OPEN_METHOD,
    fileOpenMethod: DEFAULT_FILE_OPEN_METHOD,
    agentLinkIntercept: DEFAULT_AGENT_LINK_INTERCEPT,
    agentSiteWhitelist: [...DEFAULT_AGENT_SITE_WHITELIST],
```

`getDefaultForSetting` switch 追加：

```ts
    case 'linkOpenMethod':
      return DEFAULT_LINK_OPEN_METHOD;
    case 'fileOpenMethod':
      return DEFAULT_FILE_OPEN_METHOD;
    case 'agentLinkIntercept':
      return DEFAULT_AGENT_LINK_INTERCEPT;
    case 'openMethod:agentSiteWhitelist':
      return DEFAULT_AGENT_SITE_WHITELIST;
```

- [ ] **Step 6: 运行测试 + lint**

Run: `pnpm --dir frontend run test -- preferencesMerger`
Expected: PASS。
Run: `pnpm --dir frontend run lint`
Expected: 0 error。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/ipc-types.generated.ts frontend/src/shared/preferencesMerger.ts frontend/src/shared/defaultPreferences.ts frontend/src/shared/preferencesMerger.test.ts
git commit -m "feat(settings): sync frontend preference types for open method"
```

---

## Task 3: origin 白名单归一/校验工具

**Files:**
- Create: `frontend/src/shared/originWhitelist.ts`
- Test: `frontend/src/shared/originWhitelist.test.ts`

**Interfaces:**
- Produces: `normalizeOrigin(input: string): string | null`；`parseWhitelistLines(text: string): { origins: string[]; invalid: string[] }`；`whitelistToText(origins: string[]): string`。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/shared/originWhitelist.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { normalizeOrigin, parseWhitelistLines, whitelistToText } from './originWhitelist';

describe('normalizeOrigin', () => {
  it('accepts scheme://host:port and strips path', () => {
    expect(normalizeOrigin('http://127.0.0.1:3080/chat/1')).toBe('http://127.0.0.1:3080');
  });
  it('accepts https host without path', () => {
    expect(normalizeOrigin('https://my-agent.example.com')).toBe('https://my-agent.example.com');
  });
  it('rejects non-http schemes and junk', () => {
    expect(normalizeOrigin('file:///x')).toBeNull();
    expect(normalizeOrigin('ftp://a.com')).toBeNull();
    expect(normalizeOrigin('not a url')).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
  });
});

describe('parseWhitelistLines', () => {
  it('splits, normalizes, dedups and reports invalid lines', () => {
    const r = parseWhitelistLines('http://127.0.0.1:3080\n\nhttps://a.com/x\nhttp://127.0.0.1:3080\nbad');
    expect(r.origins).toEqual(['http://127.0.0.1:3080', 'https://a.com']);
    expect(r.invalid).toEqual(['bad']);
  });
});

describe('whitelistToText', () => {
  it('joins with newlines', () => {
    expect(whitelistToText(['http://a', 'https://b'])).toBe('http://a\nhttps://b');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- originWhitelist`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `frontend/src/shared/originWhitelist.ts`：

```ts
/** 归一单个白名单行到 origin（`scheme://host[:port]`）。非 http/https 或无 host → null。 */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (!url.host) {
    return null;
  }
  return url.origin;
}

/** 解析多行文本为 origin 列表：归一、去重（保序）、分离非法行。 */
export function parseWhitelistLines(text: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const origin = normalizeOrigin(line);
    if (!origin) {
      invalid.push(line.trim());
      continue;
    }
    if (!seen.has(origin)) {
      seen.add(origin);
      origins.push(origin);
    }
  }
  return { origins, invalid };
}

export function whitelistToText(origins: string[]): string {
  return origins.join('\n');
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm --dir frontend run test -- originWhitelist`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/originWhitelist.ts frontend/src/shared/originWhitelist.test.ts
git commit -m "feat(settings): add origin whitelist normalization util"
```

---

## Task 4: 「打开方式」设置组（UI + 重置 + i18n）

**Files:**
- Modify: `frontend/src/kernel/types.ts`
- Modify: `frontend/src/app/utils/settingsViewModel.ts`
- Create: `frontend/src/app/components/settings/OriginListControl.tsx`
- Modify: `frontend/src/app/components/settings/SettingsControls.tsx`
- Modify: `frontend/src/app/components/settings/settingsGroups.ts`
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts`
- Modify: `frontend/src/app/i18n/en-US/settings.ts`
- Test: `frontend/src/app/components/settings/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: Task 2 TS 类型 + 默认值；Task 3 `parseWhitelistLines`/`whitelistToText`。
- Produces: `SettingsGroupId` 含 `'openMethod'`；`SettingItem.type` 含 `'originlist'`；4 个 SettingItem（id：`linkOpenMethod`/`fileOpenMethod`/`agentLinkIntercept`/`openMethod:agentSiteWhitelist`）。

- [ ] **Step 1: 写失败测试（设置项出现 + 写回）**

在 `frontend/src/app/components/settings/SettingsPanel.test.tsx` 追加一条：

```tsx
it('renders open-method group items and writes a whitelist change', async () => {
  // 复用本文件已有的渲染辅助与 mock appInfo（config 需含新字段，见现有夹具）
  // 切换到 openMethod 组后：
  // 1) 三个 setting 行 + 白名单文本域出现；
  // 2) 输入白名单并触发 change → onChangeSetting 以 origin 数组回调。
});
```

> 实现时按同文件既有 `describe/it` 的辅助函数（渲染 SettingsPanel + 切组 + `screen.getByText`）补齐断言；关键是断言 `data-settings-anchor="openMethod:linkOpenMethod"` 等锚点存在。此步只写骨架并运行使其失败。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- SettingsPanel`
Expected: FAIL。

- [ ] **Step 3: 扩展类型（`frontend/src/kernel/types.ts`）**

```ts
export type SettingsGroupId =
  | 'general'
  | 'workspace'
  | 'shortcuts'
  | 'terminal'
  | 'browser'
  | 'dsh'
  | 'storage'
  | 'openMethod';
```

`SettingItem.type` 改为：

```ts
  type: 'toggle' | 'select' | 'input' | 'password' | 'readonly' | 'font' | 'originlist';
```

- [ ] **Step 4: 新增设置项 + patch 映射（`frontend/src/app/utils/settingsViewModel.ts`）**

`buildSettingsItems` 内（在 fonts 块之前）追加：

```ts
  items.push({
    id: 'linkOpenMethod',
    groupId: 'openMethod',
    label: t.settingsLinkOpenMethod,
    description: t.settingsLinkOpenMethodDesc,
    type: 'select',
    value: config.linkOpenMethod,
    options: [
      { value: 'middle', label: t.settingsLinkOpenMiddle },
      { value: 'panel', label: t.settingsLinkOpenPanel },
      { value: 'external', label: t.settingsLinkOpenExternal },
    ],
  });

  items.push({
    id: 'fileOpenMethod',
    groupId: 'openMethod',
    label: t.settingsFileOpenMethod,
    description: t.settingsFileOpenMethodDesc,
    type: 'select',
    value: config.fileOpenMethod,
    options: [
      { value: 'panel', label: t.settingsFileOpenPanel },
      { value: 'external', label: t.settingsFileOpenExternal },
    ],
  });

  items.push({
    id: 'agentLinkIntercept',
    groupId: 'openMethod',
    label: t.settingsAgentIntercept,
    description: t.settingsAgentInterceptDesc,
    type: 'toggle',
    value: config.agentLinkIntercept,
  });

  items.push({
    id: 'openMethod:agentSiteWhitelist',
    groupId: 'openMethod',
    label: t.settingsAgentWhitelist,
    description: t.settingsAgentWhitelistDesc,
    type: 'originlist',
    value: config.agentSiteWhitelist.join('\n'),
  });
```

`preferencePatchFromSettingChange` 追加分支：

```ts
  if (id === 'linkOpenMethod') {
    return value === 'middle' || value === 'panel' || value === 'external'
      ? { linkOpenMethod: value }
      : undefined;
  }
  if (id === 'fileOpenMethod') {
    return value === 'panel' || value === 'external' ? { fileOpenMethod: value } : undefined;
  }
  if (id === 'agentLinkIntercept') {
    return { agentLinkIntercept: value === true };
  }
  if (id === 'openMethod:agentSiteWhitelist') {
    return { agentSiteWhitelist: parseWhitelistLines(String(value)).origins };
  }
```

文件顶部 `import { parseWhitelistLines } from '@shared/originWhitelist';`

- [ ] **Step 5: 新控件（`frontend/src/app/components/settings/OriginListControl.tsx`）**

```tsx
import { useMemo } from 'react';
import type { SettingItem } from '../../../kernel/types';
import type { CopyDict } from '../../i18n';
import { parseWhitelistLines } from '@shared/originWhitelist';

interface OriginListControlProps {
  item: SettingItem;
  t: CopyDict;
  onChange: (value: string) => void;
}

export function OriginListControl({ item, t, onChange }: OriginListControlProps) {
  const invalid = useMemo(
    () => parseWhitelistLines(String(item.value ?? '')).invalid,
    [item.value],
  );
  return (
    <div className="adl-settings-origin-list">
      <textarea
        className="adl-settings-input adl-settings-origin-list__input"
        value={String(item.value ?? '')}
        placeholder={t.settingsAgentWhitelistPlaceholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      {invalid.length > 0 && (
        <p className="adl-settings-origin-list__invalid" role="alert">
          {t.settingsAgentWhitelistInvalid}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: 渲染分派（`frontend/src/app/components/settings/SettingsControls.tsx`）**

`import { OriginListControl } from './OriginListControl';`，在 `item.type === 'font'` 块后追加：

```tsx
                {item.type === 'originlist' && (
                  <OriginListControl item={item} t={t} onChange={(v) => onChange(item.id, v)} />
                )}
```

- [ ] **Step 7: 组注册 + 重置（`frontend/src/app/components/settings/settingsGroups.ts`）**

`SETTINGS_GROUPS` 增加（放在 `browser` 之后）：

```ts
  { id: 'openMethod', labelKey: 'settingsOpenMethod' },
```

`GROUP_RESET_PATCHES` 增加：

```ts
  openMethod: () => ({
    linkOpenMethod: 'panel',
    fileOpenMethod: 'panel',
    agentLinkIntercept: false,
    agentSiteWhitelist: [],
  }),
```

`RESETTABLE_GROUPS` 自动包含（`Object.keys(GROUP_RESET_PATCHES)` 派生的 `...` 展开），无需手改——确认该集合已用展开键；若为显式列举则加入 `'openMethod'`。

- [ ] **Step 8: i18n keys（zh-CN + en-US）**

`frontend/src/app/i18n/zh-CN/settings.ts` 追加：

```ts
  settingsOpenMethod: '打开方式',
  settingsLinkOpenMethod: '网址链接打开方式',
  settingsLinkOpenMethodDesc: '点击网址链接时的打开位置（Markdown 预览与智能体站点拦截链接统一生效）',
  settingsLinkOpenMiddle: '中心打开',
  settingsLinkOpenPanel: '右侧浏览器面板打开',
  settingsLinkOpenExternal: '外部浏览器打开',
  settingsFileOpenMethod: '文件打开方式',
  settingsFileOpenMethodDesc: '点击文件链接（如 Markdown 预览中的文件索引）时的打开方式',
  settingsFileOpenPanel: '右侧文件面板打开',
  settingsFileOpenExternal: '系统默认应用打开',
  settingsAgentIntercept: '智能体站点链接拦截',
  settingsAgentInterceptDesc:
    '启用后，白名单内智能体网站正文中的网址链接、本地文件链接将按本项目设置打开；关闭则保持网站自身行为（浏览器模式不支持，仅桌面可用）',
  settingsAgentWhitelist: '智能体网址白名单',
  settingsAgentWhitelistDesc:
    '每行一个站点 origin，整站匹配（不要带路径）。示例：http://127.0.0.1:3080 或 https://my-agent.example.com',
  settingsAgentWhitelistPlaceholder: 'http://127.0.0.1:3080\nhttps://my-agent.example.com',
  settingsAgentWhitelistInvalid: '存在无法识别的行（需为 http/https 的 scheme://host:port）',
```

`frontend/src/app/i18n/en-US/settings.ts` 追加英文对照：

```ts
  settingsOpenMethod: 'Open Method',
  settingsLinkOpenMethod: 'URL Link Open Method',
  settingsLinkOpenMethodDesc: 'Where URL links open (applies to Markdown preview and intercepted agent-site links)',
  settingsLinkOpenMiddle: 'Open in center',
  settingsLinkOpenPanel: 'Open in right browser panel',
  settingsLinkOpenExternal: 'Open in external browser',
  settingsFileOpenMethod: 'File Open Method',
  settingsFileOpenMethodDesc: 'How file links open (e.g. file index links in Markdown preview)',
  settingsFileOpenPanel: 'Open in right file panel',
  settingsFileOpenExternal: 'Open with system default app',
  settingsAgentIntercept: 'Intercept agent-site links',
  settingsAgentInterceptDesc:
    'When enabled, URL and local-file links in whitelisted agent sites open via this app\u2019s settings; when off, the site\u2019s own behavior is kept (desktop only; not supported in browser mode)',
  settingsAgentWhitelist: 'Agent site allowlist',
  settingsAgentWhitelistDesc:
    'One site origin per line, whole-site match (no path). Examples: http://127.0.0.1:3080 or https://my-agent.example.com',
  settingsAgentWhitelistPlaceholder: 'http://127.0.0.1:3080\nhttps://my-agent.example.com',
  settingsAgentWhitelistInvalid: 'Some lines are invalid (expected http/https scheme://host:port)',
```

- [ ] **Step 9: 补测试断言并运行**

补齐 Step 1 的测试（断言四个锚点存在、白名单写回 `agentSiteWhitelist` 数组）。
Run: `pnpm --dir frontend run test -- settingsViewModel SettingsPanel settingsGroups`
Expected: PASS。
Run: `pnpm --dir frontend run lint`
Expected: 0 error。

- [ ] **Step 10: Commit**

```bash
git add frontend/src/kernel/types.ts frontend/src/app/utils/settingsViewModel.ts frontend/src/app/components/settings/OriginListControl.tsx frontend/src/app/components/settings/SettingsControls.tsx frontend/src/app/components/settings/settingsGroups.ts frontend/src/app/i18n/zh-CN/settings.ts frontend/src/app/i18n/en-US/settings.ts frontend/src/app/components/settings/SettingsPanel.test.tsx
git commit -m "feat(settings): add open-method settings group with agent allowlist"
```

---

## Task 5: 打开执行层（openUrlByMethod / openFileByMethod）

**Files:**
- Create: `frontend/src/app/features/preview/openByMethod.ts`
- Test: `frontend/src/app/features/preview/__tests__/openByMethod.test.ts`

**Interfaces:**
- Consumes: `useAppStore` `appInfo.config.{linkOpenMethod,fileOpenMethod}`、`browserOpenTab`、`centerShowBrowserTab`、`window.digitalLife.window.openExternal`、`openFile`/`openFileForWorkspace`。
- Produces: `openUrlByMethod(url: string): void`；`openFileByMethod(absPath: string): void`；`resolveMarkdownFileLink(currentRelPath: string, href: string): string | null`（相对→工作区相对路径）。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/features/preview/__tests__/openByMethod.test.ts`（mock store + bridge）：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserOpenTab = vi.fn();
const centerShowBrowserTab = vi.fn();
const openExternal = vi.fn();
const openFile = vi.fn();
const openFileForWorkspace = vi.fn();
let config: { linkOpenMethod: string; fileOpenMethod: string };

vi.mock('@stores/slicedStore', () => ({
  useAppStore: {
    getState: () => ({
      appInfo: { config, currentWorkspace: { id: 'ws1', path: 'C:/ws', rootPath: 'C:/ws' } },
      browserOpenTab,
      centerShowBrowserTab,
      openFile,
      openFileForWorkspace,
      browserActiveTabId: 't1',
    }),
  },
}));

vi.mock('@shared/env', () => ({ isTauriShell: () => true }));
vi.stubGlobal('window', { digitalLife: { window: { openExternal } } });

import { openFileByMethod, openUrlByMethod } from '../openByMethod';

beforeEach(() => vi.clearAllMocks());

describe('openUrlByMethod', () => {
  it('opens in center', () => {
    config = { linkOpenMethod: 'middle', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(browserOpenTab).toHaveBeenCalledWith('https://a.com');
    expect(centerShowBrowserTab).toHaveBeenCalledWith('t1');
  });
  it('opens in panel as new tab', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(browserOpenTab).toHaveBeenCalledWith('https://a.com');
    expect(centerShowBrowserTab).not.toHaveBeenCalled();
  });
  it('opens externally', () => {
    config = { linkOpenMethod: 'external', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(openExternal).toHaveBeenCalledWith('https://a.com');
  });
});

describe('openFileByMethod', () => {
  it('opens in file panel within workspace', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openFileByMethod('C:/ws/src/a.md');
    expect(openFileForWorkspace).toHaveBeenCalledWith('ws1', 'C:/ws', 'src/a.md');
  });
  it('opens externally', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'external' };
    openFileByMethod('C:/ws/src/a.md');
    expect(openExternal).toHaveBeenCalledWith('C:/ws/src/a.md');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- openByMethod`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `frontend/src/app/features/preview/openByMethod.ts`：

```ts
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import { normalizeWorkspaceRelativePath } from '@utils/workspacePaths';

function openExternal(url: string): void {
  if (isTauriShell()) {
    void window.digitalLife?.window?.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** 按「网址链接打开方式」设置打开一个 URL。中心/右面板均为新建标签，绕过就地/新建双态开关。 */
export function openUrlByMethod(url: string): void {
  const state = useAppStore.getState();
  const method = state.appInfo?.config?.linkOpenMethod ?? 'panel';
  if (method === 'external') {
    openExternal(url);
    return;
  }
  state.browserOpenTab(url);
  if (method === 'middle') {
    const id = useAppStore.getState().browserActiveTabId;
    if (id) {
      useAppStore.getState().centerShowBrowserTab(id);
    }
  }
}

/** 按「文件打开方式」设置打开一个本地绝对路径。 */
export function openFileByMethod(absPath: string): void {
  const state = useAppStore.getState();
  const method = state.appInfo?.config?.fileOpenMethod ?? 'panel';
  if (method === 'external') {
    openExternal(absPath);
    return;
  }
  const ws = state.appInfo?.currentWorkspace;
  const root = ws?.rootPath ?? ws?.path;
  if (!ws || !root) {
    openExternal(absPath);
    return;
  }
  const rel = normalizeWorkspaceRelativePath(root, absPath);
  if (!rel) {
    openExternal(absPath);
    return;
  }
  void state.openFileForWorkspace(ws.id, root, rel);
}

/** 将 Markdown 正文中的相对文件链接解析为工作区绝对路径；无法解析时返回 null。 */
export function resolveMarkdownFileLink(
  workspaceRoot: string,
  currentRelPath: string,
  href: string,
): string | null {
  let raw = href.trim();
  if (!raw) {
    return null;
  }
  if (/^file:\/\//i.test(raw)) {
    try {
      raw = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ''));
      if (/^[a-zA-Z]:/.test(raw) === false) {
        return null;
      }
    } catch {
      return null;
    }
  }
  if (raw.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(raw)) {
    return raw.replace(/\//g, '\\');
  }
  const baseDir = currentRelPath.replace(/[\\/][^\\/]*$/, '');
  const joined = baseDir ? `${baseDir}/${raw}` : raw;
  const rel = normalizeWorkspaceRelativePath(workspaceRoot, joined);
  if (!rel) {
    return null;
  }
  return `${workspaceRoot.replace(/[\\/]$/, '')}\\${rel.replace(/\//g, '\\')}`;
}
```

> 注：`normalizeWorkspaceRelativePath(root, path)` 需校验签名（`@utils/workspacePaths`）；若其语义为「绝对→相对」直接可用；若语义不同，用现有 `joinPathSegments` 反向实现「相对片段拼接 → 绝对」，并在测试里覆盖 `../` 与盘符两种情况。

- [ ] **Step 4: 运行测试**

补齐 `resolveMarkdownFileLink` 的用例（相对同目录、`../`、绝对路径）后：
Run: `pnpm --dir frontend run test -- openByMethod`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/preview/openByMethod.ts frontend/src/app/features/preview/__tests__/openByMethod.test.ts
git commit -m "feat(preview): add unified open-by-method actions"
```

---

## Task 6: Markdown 标题 slug id

**Files:**
- Modify: `frontend/src/app/features/preview/markdownPreviewUtils.ts`
- Test: `frontend/src/app/features/preview/MarkdownPreview.test.ts`

**Interfaces:**
- Produces: 标题元素 `id` 为 GitHub 风格 slug（替换 `adl-heading-{line}`）；`data-source-line` 保留。

- [ ] **Step 1: 改测试断言（失败）**

`frontend/src/app/features/preview/MarkdownPreview.test.ts` 中把 `id="adl-heading-1"` 等断言改为 slug：

```ts
expect(html).toContain('id="标题一"');       // 首个中文标题按规则生成的 slug
// 重复标题追加 -1：
expect(html).toContain('id="dup-1"');
```

并新增：两处同名标题应生成 `x` 与 `x-1`。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- MarkdownPreview.test`
Expected: FAIL。

- [ ] **Step 3: 实现 slug + 计数（`markdownPreviewUtils.ts`）**

在 `createMdInstance` 内、`heading_open` 规则定义前，加一个 `slugify` 与 `seen` 计数字典；修改规则：

```ts
  const slugCounts = new Map<string, number>();
  function slugify(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[\s]+/g, '-')
      .replace(/[!-/:-@[-`{-~。，、；：？！“”‘’（）《》【】…—]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
```

`heading_open` 规则内（原来设 `id` 的地方）改为：

```ts
      const headingText = tokens[idx + 1]?.content ?? '';
      let slug = slugify(headingText) || `section-${sourceLine}`;
      const seen = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, seen + 1);
      if (seen > 0) {
        slug = `${slug}-${seen - 1}`;
      }
      token.attrSet('id', slug);
```

（删除原 `token.attrSet('id', \`adl-heading-${sourceLine}\`)`。）

- [ ] **Step 4: 运行测试**

Run: `pnpm --dir frontend run test -- MarkdownPreview`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/preview/markdownPreviewUtils.ts frontend/src/app/features/preview/MarkdownPreview.test.ts
git commit -m "fix(preview): generate github-style slug ids for markdown headings"
```

---

## Task 7: Markdown 预览点击委托 + 面板接线

**Files:**
- Modify: `frontend/src/app/features/preview/MarkdownPreview.tsx`
- Modify: `frontend/src/app/regions/right-panel/FilePreviewRenderers.tsx`
- Modify: `frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx`
- Test: `frontend/src/app/features/preview/__tests__/MarkdownPreview.test.tsx`

**Interfaces:**
- Consumes: Task 5 `openUrlByMethod`/`openFileByMethod`/`resolveMarkdownFileLink`。
- Produces: `MarkdownPreviewProps.linkContext?: { workspaceRoot: string; fileRelPath: string }`。

- [ ] **Step 1: 写失败测试**

扩展 `frontend/src/app/features/preview/__tests__/MarkdownPreview.test.tsx`：

```tsx
it('intercepts anchor clicks and scrolls to heading', () => {
  const { container } = render(<MarkdownPreview content={'# Foo\n\n[jump](#foo)'} />);
  const link = container.querySelector('a[href="#foo"]')!;
  const spy = vi.fn();
  (container.querySelector('#foo') as HTMLElement).scrollIntoView = spy;
  fireEvent.click(link);
  expect(spy).toHaveBeenCalled();
});

it('routes http links through onOpenUrl handler', () => {
  const onOpenUrl = vi.fn();
  const { container } = render(
    <MarkdownPreview content={'[x](https://a.com)'} linkHandlers={{ onOpenUrl }} />,
  );
  fireEvent.click(container.querySelector('a')!);
  expect(onOpenUrl).toHaveBeenCalledWith('https://a.com');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- MarkdownPreview.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现（`MarkdownPreview.tsx`）**

```tsx
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
// ...
export interface MarkdownLinkHandlers {
  onOpenUrl?: (url: string) => void;
  onOpenFile?: (rawHref: string) => void;
}

interface MarkdownPreviewProps {
  content: string;
  linkHandlers?: MarkdownLinkHandlers;
}

export function MarkdownPreview({ content, linkHandlers }: MarkdownPreviewProps) {
  const mdTheme = useResolvedMarkdownTheme();
  const html = useMarkdownPreviewHtml(content);
  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);
  const innerHtml = useMemo(() => ({ __html: sanitizedHtml }), [sanitizedHtml]);
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { ensureMarkdownThemeCss(); }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (e.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href) {
        return;
      }
      e.preventDefault();
      if (href.startsWith('#')) {
        const id = href.slice(1);
        const el = rootRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (/^https?:/i.test(href)) {
        (linkHandlers?.onOpenUrl ?? ((u: string) => void window.digitalLife?.window?.openExternal(u)))(href);
        return;
      }
      if (href.includes('://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        void window.digitalLife?.window?.openExternal(href);
        return;
      }
      linkHandlers?.onOpenFile?.(href);
    },
    [linkHandlers],
  );

  return (
    <div
      ref={rootRef}
      className="adl-markdown-preview markdown-body"
      data-md-theme={mdTheme}
      onClick={handleClick}
      dangerouslySetInnerHTML={innerHtml}
    />
  );
}
```

（保持既有 `MarkdownPreviewProps` 导出兼容：把 `linkHandlers` 设为可选，剪贴板历史调用处不变。）

- [ ] **Step 4: 接线文件面板（`FilePreviewRenderers.tsx:221`）**

在 markdown 分支渲染处传入：

```tsx
<LazyMarkdownPreviewWrapper
  content={fileContent ?? ''}
  linkHandlers={linkHandlers}
/>
```

其中 `linkHandlers` 由本组件内 `useMemo` 构造（需已有 `selectedFilePath` 与工作区根）：

```tsx
const linkHandlers = useMemo(
  () => ({
    onOpenUrl: openUrlByMethod,
    onOpenFile: (href: string) => {
      const ws = useAppStore.getState().appInfo?.currentWorkspace;
      const root = ws?.rootPath ?? ws?.path;
      if (!root || !filePath) {
        return;
      }
      const abs = resolveMarkdownFileLink(root, filePath, href);
      if (abs) {
        openFileByMethod(abs);
      }
    },
  }),
  [filePath],
);
```

- [ ] **Step 5: 接线变更面板（`DiffEditorSection.tsx:357`）**

同样传入 `linkHandlers`（文件路径取 `changePreview.path`）。

- [ ] **Step 6: 运行测试 + lint**

Run: `pnpm --dir frontend run test -- MarkdownPreview`
Expected: PASS。
Run: `pnpm --dir frontend run lint`
Expected: 0 error。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/preview/MarkdownPreview.tsx frontend/src/app/features/preview/__tests__/MarkdownPreview.test.tsx frontend/src/app/regions/right-panel/FilePreviewRenderers.tsx frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx
git commit -m "feat(preview): make markdown preview links clickable (anchor/file/url)"
```

---

## Task 8: 实证智能体站点链接 DOM 形态（探针，实施期必做）

**Files:**
- Modify（临时）: `crates/browser/src/init_script.js`（仅在既有 click 委托里补一行 `__adlSendLog`，实测后回退）
- Read: `.adl-logs/debug-logs*.txt`（Tauri 壳）、`<仓库根>/ai-digital-life/.adl-logs/adl-server-logs*.txt`

**Goal:** 确认 dsh/智能体正文中「网址链接、文件」的真实 DOM/JS 机制（锚点？`window.open`？自定义 onClick？http 下载？`file://`？），据此确定 Task 9 拦截点。禁止凭空假设。

- [ ] **Step 1: 启动桌面端并调高日志**

Run（工作目录 `ai-digital-life/`）：`pnpm dev:tauri -- --log-level trace --terminal-log-mode multi`
断言启动输出含 `[ADL-LOG]` 载体行。

- [ ] **Step 2: 用「用户为手」触发（桌面壳点击无自动化）**

给出编号步骤给用户：① 中/右面板打开 dsh 智能体网站；② 让 agent 输出一个网址链接并点击；③ 让 agent 输出一个文件链接并点击；④ 完成后回复「操作完成」。同时声明预期日志文件：`<仓库根>/.adl-logs/debug-logs-*.txt`。

- [ ] **Step 3: 读最新日志，记录机制**

按日志协议只取 `LastWriteTime` 最新的 `debug-logs*.txt`。记录：链接元素 tagName、有无 `download`、href scheme、是否触发 `click` 委托 / `window.open` / 表单。

- [ ] **Step 4: 更新 spec §8.3 的实证结论**

把观察结果写入进度文件 + 如有偏差更新 `spec` §8.3/§12（例如「文件」实为 http 下载 → 归入 url 分支）。

- [ ] **Step 5: 回退临时日志**

删除 Step 1 加的临时 `__adlSendLog`（若为新增）；确认 `git diff` 无遗留。

> 若无法实测（dsh 环境不可用），在本步骤记录「未实测」并保持 Task 9 的保守分类（仅 `file://` 视为文件），在 P5 文档中标注开放项。

---

## Task 9: 智能体站点链接拦截（注入 + Rust + 前端）

**Files:**
- Modify: `crates/browser/src/browser_navigation.rs`
- Modify: `crates/browser/src/init_script.js`
- Modify: `crates/browser/src/webview_handle.rs`
- Modify: `crates/browser/src/webview2_postmessage.rs`
- Modify: `crates/browser/src/browser_webview.rs`
- Modify: `src-tauri/src/commands/browser_webview_setup.rs`
- Modify: `src-tauri/src/commands/browser.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/permissions/digital-life.toml`
- Modify: `frontend/src/shared/ipc/browser.ts`、`tauri-bridge/tauri-browser.ts`、`mock/mock-browser.ts`、`preview-bridge/index.ts`、`httpBridge.ts`
- Create: `frontend/src/app/features/browser/useBrowserAgentLinkSubscription.ts`
- Test: `crates/browser/src/webview2_postmessage.rs`、`crates/browser/src/browser_webview.rs`、`frontend/src/app/features/browser/initScriptNavigation.test.ts`

**Interfaces:**
- Consumes: Task 3 whitelist（前端持有）；Task 5 `openUrlByMethod`/`openFileByMethod`。
- Produces: postMessage `{type:'adl-agent-link', kind:'url'|'file', url}`；事件 `digital-life://browser-agent-link` → 前端 `onAgentLink((payload:{kind,url})=>void)`；命令 `browser_set_agent_intercept(origins: string[], enabled: boolean)`；`browser_create_for_tab` 增 `agentOrigins`/`agentInterceptEnabled`。

- [ ] **Step 1: Rust 写失败测试（解析 + origin 白名单）**

`crates/browser/src/webview2_postmessage.rs` tests 追加：

```rust
#[test]
fn agent_link_parses_valid_payload() {
    let json = r#"{"type":"adl-agent-link","kind":"url","url":"https://a.com/x"}"#;
    let parsed = super::agent_link_from_message(json).unwrap();
    assert_eq!(parsed.kind, "url");
    assert_eq!(parsed.url, "https://a.com/x");
}

#[test]
fn agent_link_accepts_file_kind_with_path() {
    let json = r#"{"type":"adl-agent-link","kind":"file","url":"file:///C:/ws/a.md"}"#;
    let parsed = super::agent_link_from_message(json).unwrap();
    assert_eq!(parsed.kind, "file");
}

#[test]
fn agent_link_rejects_unknown_kind_and_type() {
    assert!(super::agent_link_from_message(r#"{"type":"other","kind":"url","url":"https://a"}"#).is_none());
    assert!(super::agent_link_from_message(r#"{"type":"adl-agent-link","kind":"x","url":"u"}"#).is_none());
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-browser --lib webview2_postmessage`
Expected: 编译失败（`agent_link_from_message` 不存在）。

- [ ] **Step 3: 实现解析（`webview2_postmessage.rs`）**

在 `open_new_tab_url_from_message` 旁新增：

```rust
pub struct AgentLink {
    pub kind: String,
    pub url: String,
}

/// 纯解析 `{type:'adl-agent-link', kind:'url'|'file', url}` postMessage。
/// `kind` 仅接受 `url`/`file`；`url` 非空。origin 白名单校验由调用方按注入端已匹配结果信任
/// （注入脚本只在白名单站点启用该分支），此处再做 scheme 兜底。
pub fn agent_link_from_message(json: &str) -> Option<AgentLink> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value.get("type").and_then(|t| t.as_str()) != Some("adl-agent-link") {
        return None;
    }
    let kind = value.get("kind").and_then(|v| v.as_str())?;
    if kind != "url" && kind != "file" {
        return None;
    }
    let url = value.get("url").and_then(|v| v.as_str())?;
    if url.is_empty() {
        return None;
    }
    Some(AgentLink { kind: kind.to_string(), url: url.to_string() })
}
```

在 message handler（第 86 行 `open_new_tab_url_from_message` 附近）前插入：

```rust
                        if let Some(link) = super::agent_link_from_message(&json_str) {
                            bridge_for_handler.emit_agent_link(&tab_id_for_handler, &link.kind, &link.url);
                            return Ok(());
                        }
```

- [ ] **Step 4: 事件桥方法（`webview_handle.rs`）**

`WebView2EventBridge` 末尾追加（默认空实现，兼容实现方）：

```rust
    /// Emit an intercepted agent-site link click. Triggered by `init_script.js`
    /// only for whitelisted agent sites (postMessage `{type:'adl-agent-link', ...}`).
    fn emit_agent_link(&self, _tab_id: &str, _kind: &str, _url: &str) {}
```

（`meta_cache_bridge.rs` 因复用 trait 默认实现无需改动。）

- [ ] **Step 5: 浏览器脚本分支（`init_script.js`）**

在 IIFE 顶部定义（从注入参数读取）：

```js
    var __adlAgentOrigins = (window.__adlAgentOrigins) || [];
    var __adlAgentInterceptEnabled = (window.__adlAgentInterceptEnabled) || false;
    function __adlIsAgentHost() {
        try { return __adlAgentInterceptEnabled && __adlAgentOrigins.indexOf(location.origin) !== -1; }
        catch (e) { return false; }
    }
    function __adlSendAgentLink(kind, url) {
        try {
            if (window.chrome && chrome.webview && chrome.webview.postMessage) {
                chrome.webview.postMessage(JSON.stringify({ type: 'adl-agent-link', kind: kind, url: url }));
                return true;
            }
        } catch (e) {}
        return false;
    }
```

在锚点 click 委托里（`if (target.tagName === 'A' && target.href)` 分支），在 blob/download 判断**之后**、`isValidWebUrl` 分支**之前**插入：

```js
                if (__adlIsAgentHost() && __adlSendAgentLink('url', href)) {
                    event.preventDefault();
                    return;
                }
```

并在非 http 分支（`else { console.debug(...) }`）改：

```js
                } else if (__adlIsAgentHost() && __adlSendAgentLink('file', href)) {
                    event.preventDefault();
                    return;
                } else {
                    console.debug('[ADL-DL-JS] click on <a> but NOT intercepted (invalid URL):', { href: href });
                }
```

`window.open` 内、在 `if (resolvedUrl && isValidWebUrl(resolvedUrl))` 之前插入：

```js
        if (__adlIsAgentHost() && __adlSendAgentLink('url', resolvedUrl || rawUrl)) {
            return null;
        }
```

注入参数烘焙（`browser_navigation.rs`）：

```rust
pub fn init_script_with_background_and_agent(
    color_scheme: &str,
    agent_origins: &[String],
    agent_intercept_enabled: bool,
) -> String {
    let origins = serde_json::to_string(agent_origins).unwrap_or_else(|_| "[]".to_string());
    let prefix = format!(
        "(function() {{ window.__adlAgentOrigins = {origins}; window.__adlAgentInterceptEnabled = {enabled}; }})();\n",
        enabled = agent_intercept_enabled,
    );
    format!("{prefix}{}", init_script_with_background(color_scheme))
}
```

（需在 `crates/browser/src/lib.rs` 导出 `init_script_with_background_and_agent`。）

- [ ] **Step 6: 注入脚本测试（`initScriptNavigation.test.ts`）**

追加用例：给定 `window.__adlAgentOrigins=['http://127.0.0.1:3080']` 且 `__adlAgentInterceptEnabled=true`，点击 http 锚点 → `chrome.webview.postMessage` 收到 `adl-agent-link`/`kind:'url'`；`file://` 锚点 → `kind:'file'`；开关 false 或无白名单 → 不发送（沿用既有断言手法）。

Run: `pnpm --dir frontend run test -- initScriptNavigation`
Expected: PASS。

- [ ] **Step 7: BrowserManager 刷新命令（`browser_webview.rs`）**

仿 `set_color_scheme_for_all` 新增：

```rust
    pub fn set_agent_intercept_for_all(
        &self,
        origins: &[String],
        enabled: bool,
    ) -> Result<(), AppError> {
        let origins_json = serde_json::to_string(origins)
            .map_err(|e| AppError::Internal(format!("serialize origins: {e}")))?;
        let js = format!(
            "window.__adlAgentOrigins = {origins_json}; window.__adlAgentInterceptEnabled = {enabled};"
        );
        for tab_id in self.pool.tab_ids() {
            if let Some(handle) = self.try_handle(&tab_id)? {
                let _ = handle.eval_js(&js);
            }
        }
        Ok(())
    }
```

`crates/browser/src/lib.rs` 无需新增导出（方法在已导出类型上）。

- [ ] **Step 8: Tauri 命令（`src-tauri/src/commands/browser.rs` + 注册）**

新增命令：

```rust
#[tauri::command]
pub async fn browser_set_agent_intercept(
    state: tauri::State<'_, crate::state::AppState>,
    origins: Vec<String>,
    enabled: bool,
) -> Result<(), adl_errors::AppError> {
    state.browser_manager.set_agent_intercept_for_all(&origins, enabled)
}
```

（按 `browser.rs` 现有命令取 manager 的实际写法调整 `state`/`manager` 字段名。）

注册：`src-tauri/src/main.rs` 的 `generate_handler![]` 加 `commands::browser::browser_set_agent_intercept`；`src-tauri/permissions/digital-life.toml` 加 `"browser_set_agent_intercept"`。

`browser_create_for_tab` 增参 `agent_origins: Vec<String>`、`agent_intercept_enabled: bool`，透传到 `build_webview_builder` → `init_script_with_background_and_agent`；`build_webview_builder` 签名同步加两参。

Run: `cargo test -p adl-browser --lib` + `cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS / 0 警告。

- [ ] **Step 9: 前端 bridge + 订阅**

`frontend/src/shared/ipc/browser.ts` 接口加：

```ts
  /** 订阅被拦截的智能体站点链接点击（仅 Tauri；白名单站点）。 */
  onAgentLink: (listener: (payload: { kind: 'url' | 'file'; url: string }) => void) => () => void;
```

`tauri-bridge/tauri-browser.ts` 实现（仿 `onOpenNewTab`，监听 `digital-life://browser-agent-link`，payload `{kind,url}`）。
`mock/mock-browser.ts`：`onAgentLink: () => () => {}`。
`preview-bridge/index.ts` 与 `httpBridge.ts`：同空实现。

新增 `frontend/src/app/features/browser/useBrowserAgentLinkSubscription.ts`：

```ts
import { useEffect } from 'react';
import { isTauriShell } from '@shared/env';
import { openFileByMethod, openUrlByMethod } from '@features/preview/openByMethod';

export function useBrowserAgentLinkSubscription(): void {
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge?.onAgentLink) {
      return;
    }
    return bridge.onAgentLink(({ kind, url }) => {
      if (kind === 'url') {
        openUrlByMethod(url);
      } else {
        openFileByMethod(url);
      }
    });
  }, []);
}
```

在浏览器特征挂载处调用该 hook（与 `useBrowserNewTabSubscription` 同处，见 `BrowserPanel.tsx` / 中心浏览器视图）。

- [ ] **Step 10: 设置变更 → 刷新（前端）**

在 `updatePreferences` 成功后（`generalActions.ts` 的偏好处理，或设置组件侧）当 patch 含 `agentLinkIntercept`/`agentSiteWhitelist` 时调用 `window.digitalLife.browser.setAgentIntercept(origins, enabled)`（新 `BrowserBridge` 方法，Tauri 命令封装；mock/preview 空实现）。创建标签时（`createForTab` 调用点）传入当前 origins/enabled。

- [ ] **Step 11: 运行全部受影响测试 + lint**

Run: `cargo test -p adl-browser --lib` && `cargo clippy --workspace --all-targets -- -D warnings`
Run: `pnpm --dir frontend run test -- initScriptNavigation browser` && `pnpm --dir frontend run lint`
Expected: PASS / 0 警告。

- [ ] **Step 12: Commit**

```bash
git add crates/browser src-tauri frontend/src
git commit -m "feat(browser): intercept whitelisted agent-site links (Tauri)"
```

---

## Task 10: 浏览器模式置灰说明

**Files:**
- Modify: `frontend/src/app/components/settings/SettingsControls.tsx`（或 `OriginListControl`/开关项按环境禁用）
- Modify: `frontend/src/app/utils/settingsViewModel.ts`
- Test: `frontend/src/app/components/settings/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `isTauriShell()`（`@shared/env`）。

- [ ] **Step 1: 写失败测试**

断言在非 Tauri 环境（mock `isTauriShell` 为 false）下 `agentLinkIntercept` 行与白名单控件 `disabled`，且描述含「仅桌面」。

- [ ] **Step 2: 实现**

`SettingItem` 增可选 `disabled?: boolean`（`kernel/types.ts`）。`buildSettingsItems` 中：

```ts
  const agentEnabled = isTauriShell();
  // agentLinkIntercept 项：disabled: !agentEnabled
  // openMethod:agentSiteWhitelist 项：disabled: !agentEnabled
```

`ToggleControl` 与 `OriginListControl` 读取 `item.disabled` 设 `disabled` 属性。

- [ ] **Step 3: 运行测试 + lint**

Run: `pnpm --dir frontend run test -- SettingsPanel` && `pnpm --dir frontend run lint`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/kernel/types.ts frontend/src/app/utils/settingsViewModel.ts frontend/src/app/components/settings
git commit -m "feat(settings): disable agent-link interception in browser mode"
```

---

## Self-Review（作者自查）

- **Spec 覆盖**：§5 设置层 → Task 1/2/4/10；§6 执行层 → Task 5；§7 Markdown → Task 6/7；§8 拦截 → Task 8（实证）/9；§9 双端 → Task 10；§11 测试 → 各 Task 内测试步骤；§12 风险 → Task 8 实证 + Task 5 路径 util 注。
- **占位符**：无 TBD/TODO；Step 1 中测试的「补齐断言」处已给具体断言方向（锚点/数组），执行时按同文件辅助函数落地。
- **类型一致性**：Rust 字段 snake_case 与 TS camelCase 一一对应；`openMethod:agentSiteWhitelist` id 在 viewModel/defaultPreferences/测试三处一致；`onAgentLink` payload `{kind,url}` 在 bridge/Rust/订阅三处一致。
- **开放项**：`normalizeWorkspaceRelativePath` 语义需在执行 Task 5 前核实（已注）。
