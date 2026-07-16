# 设置面板优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复设置面板所有 C/H/M 级问题（类型契约、错误处理、i18n、CSS、无障碍等），并补全核心功能（快捷键录制、字体设置、日志级别、Toast 反馈、恢复默认、主题预览），对照 OpenCode 桌面端设置面板的优秀设计进行重构。

**Architecture:** 以"统一类型契约真源（ts-rs 生成类型）"为基石，建立"命令注册中心 + 快捷键录制 + 冲突检测"三层快捷键系统，引入"全局 Toast store"作为操作反馈基础设施，重构 SettingsControls 为可扩展的控件库（支持 keybind/slider/font 等新控件），所有设置变更遵循"即时保存 + 乐观更新 + 失败回滚 + Toast 反馈"模式。

**Tech Stack:** React 19 + TypeScript 5.x + Zustand（切片合并）+ Tauri 2.x（Rust 后端）+ ts-rs（类型生成）+ Vitest（单元测试）+ 项目自研 i18n（useTCopy）+ 项目自研 ThemeController

## Global Constraints

- **类型真源**：所有 IPC 类型必须使用 `frontend/src/shared/ipc-types.generated.ts`（ts-rs 生成），禁止手写同名类型
- **i18n 全覆盖**：所有 UI 文本（含 aria-label、placeholder、空状态、Toast 消息）必须使用 i18n key，禁止硬编码中英文
- **CSS token 规范**：颜色必须用 `var(--*)`，禁止硬编码；字体大小用 `--text-*`（非 `--font-size-*`）；动画用 `--transition-*` / `--ease-*`，禁止 `transition: all`
- **错误处理规范**：每个 mutation action 入口 `clearError(get)`，失败 `captureTypedError(get, error)`，异步操作用 `isFetching` 模式防重入
- **无障碍**：WCAG 2.1 AA，所有交互控件为真实 `<button>`/`<input>`，input 必须有 visible 或 `.sr-only` label，导航项用 `aria-current="page"`
- **双端一致性**：Tauri / Preview / Mock 三端桥接必须同步实现，共享 `applyPreferencePatch` 合并函数
- **TDD**：每个新功能先写失败测试，验证失败后再实现，验证通过后提交
- **Commit 规范**：`type(scope): summary`，scope ∈ {core, frontend, rust, stores, browser, terminal, ipc, docs, deps}
- **Node.js PATH**：执行 npm/pnpm 命令前必须 `$env:Path = "D:\Program Files\nodejs;$env:Path"`
- **Rust PATH**：执行 cargo 命令前必须 `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- **代理**：执行 cargo 命令前确保 Clash 代理（127.0.0.1:7890）已开启

---

## File Structure

### 新建文件

| 文件路径 | 职责 |
|---|---|
| `frontend/src/app/commands/commandRegistry.ts` | 命令注册中心：注册命令、查询命令、绑定快捷键 |
| `frontend/src/app/commands/commandRegistry.test.ts` | 命令注册中心单元测试 |
| `frontend/src/app/commands/defaultCommands.ts` | 默认命令清单（所有可绑定快捷键的命令） |
| `frontend/src/app/commands/useCommandRegistry.ts` | React hook：订阅命令注册中心 |
| `frontend/src/app/hooks/useKeyCapture.ts` | 快捷键录制 hook（keydown 拦截 + 冲突检测） |
| `frontend/src/app/hooks/useKeyCapture.test.ts` | useKeyCapture 单元测试 |
| `frontend/src/app/components/settings/KeybindControl.tsx` | 快捷键录制控件（点击→Press keys→录入） |
| `frontend/src/app/components/settings/KeybindSettings.tsx` | 快捷键设置页（分组列表 + 搜索 + 重置） |
| `frontend/src/app/components/settings/FontControl.tsx` | 字体输入控件（实时预览 CSS 变量） |
| `frontend/src/app/components/settings/SettingsRow.tsx` | 通用设置行（title/description/control 三段式，data-slot 抽象） |
| `frontend/src/app/components/settings/SettingsSection.tsx` | 设置分组容器（标题 + 子项列表） |
| `frontend/src/app/stores/slices/toastSlice.ts` | 全局 Toast store 切片 |
| `frontend/src/app/stores/slices/toastSliceTypes.ts` | Toast 切片类型 |
| `frontend/src/app/i18n/zh-CN/settings.ts` | 设置专用 i18n 键（zh-CN） |
| `frontend/src/app/i18n/en-US/settings.ts` | 设置专用 i18n 键（en-US） |
| `frontend/src/shared/keybinds.ts` | 纯函数：recordKeybind / normalizeKey / signatures / parseKeybind / formatKeybind |
| `frontend/src/shared/keybinds.test.ts` | keybinds 纯函数测试 |
| `frontend/src/shared/defaultPreferences.ts` | 默认偏好值（用于"恢复默认"功能） |
| `frontend/src/shared/defaultPreferences.test.ts` | 默认偏好值测试 |
| `frontend/src/app/utils/settingsViewModel.test.ts` | 重写：真实测试 buildSettingsItems + preferencePatchFromSettingChange |

### 修改文件

| 文件路径 | 修改要点 |
|---|---|
| `crates/kernel/src/types/config.rs` | 扩展 AppPreferencePatch：添加 `keybinds`、`fonts` 字段；扩展 ConfigSnapshot/AppConfig 同步 |
| `src-tauri/src/commands/app.rs` | app_update_preferences 处理新增字段（keybinds/fonts） |
| `frontend/src/shared/ipc-types.generated.ts` | 由 cargo test --workspace 自动重新生成（不手动编辑） |
| `frontend/src/shared/preferencesMerger.ts` | applyPreferencePatch 处理 logLevel/terminalLogMode/debugLogMode/keybinds/fonts |
| `frontend/src/app/stores/actions/generalActions.ts` | updatePreferences 修复错误处理（clearError/captureTypedError/isFetching） |
| `frontend/src/app/utils/settingsViewModel.ts` | 改用生成类型；删除 model:* 项；新增 logLevel/terminalLogMode/debugLogMode/fonts/keybinds 项 |
| `frontend/src/app/components/settings/SettingsControls.tsx` | 修复 i18n 硬编码；InputControl 添加 debounce；新增 KeybindControl/FontControl 路由 |
| `frontend/src/app/components/settings/SettingsNav.tsx` | 删除 model 分组；添加 aria-current；添加箭头导航 |
| `frontend/src/app/components/settings/SettingsPanel.tsx` | 注册 CustomAgentSettings；SETTINGS_COMPONENTS 添加 shortcuts 映射；搜索框添加 sr-only label |
| `frontend/src/app/regions/right-panel/hooks/useSettingsPanelProps.ts` | 适配新设置项类型 |
| `frontend/src/styles/components/settings.css` | 修复硬编码颜色、错误 token、动画 token；添加焦点环；新增 KeybindControl/FontControl/SettingsRow 样式 |
| `frontend/src/styles/tokens.css` | 字体变量从 `:root` 移到可被 JS 修改的位置（或新增 `--font-sans-custom`/`--font-mono-custom` 变量） |
| `frontend/src/app/i18n/zh-CN/index.ts` | 导入新 settings.ts 模块 |
| `frontend/src/app/i18n/en-US/index.ts` | 导入新 settings.ts 模块 |
| `frontend/src/app/i18n/zh-CN/models.ts` | 移除已迁移到 settings.ts 的键 |
| `frontend/src/app/i18n/en-US/models.ts` | 同步移除 |
| `frontend/src/app/stores/createStore.ts`（或等价入口） | 合并 toastSlice |
| `frontend/src/kernel/types.ts` | 废弃手写 AppPreferencePatch，改为 re-export 生成类型；SettingsGroupId 移除 'model' |
| `frontend/src/app/App.tsx` | 集成全局 ToastContainer；useKeyboardShortcuts 改用 commandRegistry |
| `frontend/src/app/hooks/useKeyboardShortcuts.ts` | 改用 commandRegistry 驱动（保留兼容） |
| `frontend/src/app/features/provider-manager/ProviderSettings.tsx` | 添加 header（风格统一） |
| `frontend/src/app/features/plugin-manager/PluginSettings.tsx` | 添加 header |
| `frontend/src/app/features/reference-manager/ReferenceSettings.tsx` | 添加 header |
| `frontend/src/app/features/custom-agent/CustomAgentSettings.tsx` | 添加 header；注册到 SETTINGS_COMPONENTS |

---

## Phase A：基础修复（类型契约 + 错误处理 + 测试）

### Task 1: 统一类型契约（C1/M6）

**Files:**
- Modify: `frontend/src/kernel/types.ts:8-43`
- Modify: `frontend/src/app/utils/settingsViewModel.ts:1-10`
- Modify: `frontend/src/app/stores/actions/generalActions.ts:1-20`
- Modify: `frontend/src/shared/preferencesMerger.ts:1-8`
- Test: `frontend/src/shared/preferencesMerger.test.ts`（新建）

**Interfaces:**
- Consumes: `AppPreferencePatch` from `frontend/src/shared/ipc-types.generated.ts:35`
- Produces: 所有消费者统一从 `@ai-digital-life/shared/ipc-types.generated` 导入 `AppPreferencePatch`、`ConfigSnapshot`、`ModelProviderPreference`、`ModelProviderPreferencePatch`、`ModelProviderId`、`ThemeMode`、`Theme`、`LogMode`

- [ ] **Step 1: 写失败测试 — preferencesMerger 处理 logLevel/terminalLogMode/debugLogMode**

创建 `frontend/src/shared/preferencesMerger.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { applyPreferencePatch } from './preferencesMerger';
import type { AppPreferencePatch, ConfigSnapshot } from './ipc-types.generated';

const baseConfig: ConfigSnapshot = {
  language: 'zh-CN',
  themeMode: 'system',
  resolvedTheme: 'light',
  logLevel: 'info',
  terminalLogMode: 'overwrite',
  debugLogMode: 'overwrite',
  maxRecentWorkspaces: 10,
  modelPreferences: { providers: { deepseek: { enabled: true, priority: 1, modelId: 'deepseek-chat' } } },
};

describe('applyPreferencePatch', () => {
  it('applies logLevel patch', () => {
    const patch: AppPreferencePatch = { logLevel: 'debug' };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.logLevel).toBe('debug');
  });

  it('applies terminalLogMode patch', () => {
    const patch: AppPreferencePatch = { terminalLogMode: 'append' };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.terminalLogMode).toBe('append');
  });

  it('applies debugLogMode patch', () => {
    const patch: AppPreferencePatch = { debugLogMode: 'multi' };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.debugLogMode).toBe('multi');
  });

  it('preserves existing fields when patching logLevel only', () => {
    const patch: AppPreferencePatch = { logLevel: 'warn' };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.language).toBe('zh-CN');
    expect(result.terminalLogMode).toBe('overwrite');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/shared/preferencesMerger.test.ts`

Expected: FAIL — `result.logLevel` 仍是 `'info'`（applyPreferencePatch 未处理 logLevel）

- [ ] **Step 3: 实现 — applyPreferencePatch 处理 logLevel/terminalLogMode/debugLogMode**

修改 `frontend/src/shared/preferencesMerger.ts`，在 `if (patch.modelPreferences)` 块之前插入：

```typescript
  if (patch.logLevel) {
    nextConfig.logLevel = patch.logLevel;
  }
  if (patch.terminalLogMode) {
    nextConfig.terminalLogMode = patch.terminalLogMode;
  }
  if (patch.debugLogMode) {
    nextConfig.debugLogMode = patch.debugLogMode;
  }
```

同时修改顶部 import，从 `./ipc-types.generated` 导入类型（替换手写类型）：

```typescript
import type {
  AppPreferencePatch,
  ConfigSnapshot,
  ModelProviderPreference,
} from './ipc-types.generated';
import { resolveCurrentTheme } from './resolveTheme';
```

- [ ] **Step 4: 运行测试验证通过**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/shared/preferencesMerger.test.ts`

Expected: PASS

- [ ] **Step 5: 修改 kernel/types.ts — 废弃手写 AppPreferencePatch，改为 re-export**

修改 `frontend/src/kernel/types.ts:8-43`，删除手写的 `AppPreferencePatch`、`ModelProviderPreference`、`ModelProviderPreferencePatch`、`ThemeMode`、`Theme`，改为从生成类型 re-export：

```typescript
// 废弃手写类型，统一使用 ts-rs 生成类型作为真源
export type {
  AppPreferencePatch,
  AppInfo,
  ConfigSnapshot,
  ModelProviderPreference,
  ModelProviderPreferencePatch,
  ModelProviderId,
  ThemeMode,
  Theme,
  LogMode,
} from '../shared/ipc-types.generated';
```

保留 `SettingsGroupId`、`SettingItem`、`LanguageCode` 等非 IPC 类型，但从 `SettingsGroupId` 中移除 `'model'`：

```typescript
export type SettingsGroupId =
  | 'general'
  | 'agent'
  | 'workspace'
  | 'shortcuts'
  | 'mcp'
  | 'providers'
  | 'commands'
  | 'permissions'
  | 'plugins'
  | 'references'
  | 'lsp';
```

- [ ] **Step 6: 修改 settingsViewModel.ts — 改用生成类型**

修改 `frontend/src/app/utils/settingsViewModel.ts:1-10`，更新 import：

```typescript
import type {
  AppInfo,
  AppPreferencePatch,
  ConfigSnapshot,
  ModelProviderId,
  ModelProviderPreference,
} from '../../shared/ipc-types.generated';
import type { CopyDict } from '../i18n/types';
import type { SettingItem, SettingsGroupId } from '../../kernel/types';
```

- [ ] **Step 7: 修改 generalActions.ts — 改用生成类型**

修改 `frontend/src/app/stores/actions/generalActions.ts:1-20`，更新 import：

```typescript
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
```

删除从 `@ai-digital-life/kernel` 导入 `AppPreferencePatch` 的行。

- [ ] **Step 8: 运行类型检查验证**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`

Expected: PASS（无类型错误）

- [ ] **Step 9: 提交**

```bash
git add frontend/src/shared/preferencesMerger.ts frontend/src/shared/preferencesMerger.test.ts frontend/src/kernel/types.ts frontend/src/app/utils/settingsViewModel.ts frontend/src/app/stores/actions/generalActions.ts
git commit -m "fix(ipc): unify AppPreferencePatch type source to ts-rs generated types"
```

---

### Task 2: 修复 updatePreferences 错误处理（C2）

**Files:**
- Modify: `frontend/src/app/stores/actions/generalActions.ts:194-214`
- Test: `frontend/src/app/stores/actions/generalActions.test.ts`（如不存在则新建）

**Interfaces:**
- Consumes: `clearError`、`captureTypedError` from `frontend/src/app/stores/cacheHelpers.ts:136-191`；`startFetch` 模式 from `fetchActions.ts:8-13`
- Produces: `updatePreferences` 遵循 isFetching 模式，key 为 `'updatePreferences'`

- [ ] **Step 1: 写失败测试 — updatePreferences 失败时调用 captureTypedError 并设置 isFetching**

创建/修改 `frontend/src/app/stores/actions/generalActions.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../createStore';

vi.mock('../../../tauri-bridge', () => ({
  window: {
    digitalLife: {
      app: {
        updatePreferences: vi.fn(),
      },
    },
  },
}));

describe('updatePreferences action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets isFetching[updatePreferences] during call', async () => {
    const { window } = await import('../../../tauri-bridge');
    let resolvePromise: (value: { ok: true; data: unknown }) => void;
    window.digitalLife.app.updatePreferences.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    const store = useAppStore.getState();
    const promise = store.updatePreferences({ language: 'en-US' });
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(true);

    resolvePromise!({ ok: true, data: { config: { themeMode: 'system' } } });
    await promise;
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(false);
  });

  it('captures typed error on failure and clears isFetching', async () => {
    const { window } = await import('../../../tauri-bridge');
    window.digitalLife.app.updatePreferences.mockResolvedValue({
      ok: false,
      error: { code: 'CONFIG_ERROR', message: 'Invalid preference' },
    });

    const store = useAppStore.getState();
    await store.updatePreferences({ language: 'invalid' });

    expect(useAppStore.getState().error).toContain('[CONFIG_ERROR]');
    expect(useAppStore.getState().error).toContain('Invalid preference');
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(false);
  });

  it('clears error on entry', async () => {
    const { window } = await import('../../../tauri-bridge');
    window.digitalLife.app.updatePreferences.mockResolvedValue({ ok: true, data: { config: { themeMode: 'system' } } });

    const store = useAppStore.getState();
    store.setError('previous error');
    await store.updatePreferences({ language: 'en-US' });
    expect(useAppStore.getState().error).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/stores/actions/generalActions.test.ts`

Expected: FAIL — isFetching 未设置、error 格式不正确

- [ ] **Step 3: 实现 — 修复 updatePreferences**

修改 `frontend/src/app/stores/actions/generalActions.ts:194-214`：

```typescript
updatePreferences: async (patch: AppPreferencePatch) => {
  const key = 'updatePreferences';
  if (get().isFetching[key]) return;
  clearError(get);
  set({ isFetching: { ...get().isFetching, [key]: true } });
  try {
    const result = await window.digitalLife.app.updatePreferences(patch);
    if (!result.ok) {
      captureTypedError(get, result.error);
      return;
    }
    const responseMode = result.data.config.themeMode;
    themeController.setTheme({ mode: responseMode });
    themeController.hydrate();
    result.data.config.resolvedTheme = resolveCurrentTheme(responseMode);
    set((state: StoreState) => ({
      appInfo: result.data,
      sessions: state.sessions,
    }));
    if (patch.modelPreferences) {
      await get().refreshModelHealth();
    }
  } catch (error) {
    captureTypedError(get, error);
  } finally {
    set({ isFetching: { ...get().isFetching, [key]: false } });
  }
},
```

确保文件顶部 import 了 `clearError`、`captureTypedError`：

```typescript
import { clearError, captureTypedError } from '../cacheHelpers';
```

- [ ] **Step 4: 运行测试验证通过**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/stores/actions/generalActions.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/actions/generalActions.ts frontend/src/app/stores/actions/generalActions.test.ts
git commit -m "fix(stores): updatePreferences follows error-handling spec with clearError/captureTypedError/isFetching"
```

---

### Task 3: 补全 settingsViewModel 测试（C3）

**Files:**
- Modify: `frontend/src/app/utils/settingsViewModel.test.ts:1-13`（重写）

**Interfaces:**
- Consumes: `buildSettingsItems`、`preferencePatchFromSettingChange` from `settingsViewModel.ts`

- [ ] **Step 1: 重写测试文件**

替换 `frontend/src/app/utils/settingsViewModel.test.ts:1-13` 全部内容：

```typescript
import { describe, it, expect } from 'vitest';
import { buildSettingsItems, preferencePatchFromSettingChange } from './settingsViewModel';
import type { AppInfo } from '../../shared/ipc-types.generated';
import type { CopyDict } from '../i18n/types';

const mockAppInfo: AppInfo = {
  appName: 'AI Digital Life',
  version: '1.0.0',
  config: {
    language: 'zh-CN',
    themeMode: 'system',
    resolvedTheme: 'light',
    logLevel: 'info',
    terminalLogMode: 'overwrite',
    debugLogMode: 'overwrite',
    maxRecentWorkspaces: 10,
    modelPreferences: {
      providers: {
        deepseek: { enabled: true, priority: 1, modelId: 'deepseek-chat' },
        minimax: { enabled: false, priority: 2, modelId: 'abab6' },
      },
    },
  },
  currentWorkspace: null,
  recentLogs: [],
};

const mockT = { settingsLanguage: '语言', settingsTheme: '主题', settingsLogLevel: '日志级别' } as unknown as CopyDict;

describe('buildSettingsItems', () => {
  it('includes language and themeMode in general group', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('language');
    expect(ids).toContain('themeMode');
  });

  it('includes logLevel/terminalLogMode/debugLogMode in general group', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('logLevel');
    expect(ids).toContain('terminalLogMode');
    expect(ids).toContain('debugLogMode');
  });

  it('does not generate model:* items (moved to providers group)', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const modelItems = items.filter((i) => i.id.startsWith('model:'));
    expect(modelItems).toHaveLength(0);
  });

  it('language select has zh-CN and en-US options', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const langItem = items.find((i) => i.id === 'language');
    expect(langItem?.type).toBe('select');
    expect(langItem?.options?.map((o) => o.value)).toEqual(['zh-CN', 'en-US']);
  });
});

describe('preferencePatchFromSettingChange', () => {
  it('converts language change to patch', () => {
    const patch = preferencePatchFromSettingChange('language', 'en-US');
    expect(patch?.language).toBe('en-US');
  });

  it('converts themeMode change to patch', () => {
    const patch = preferencePatchFromSettingChange('themeMode', 'dark');
    expect(patch?.themeMode).toBe('dark');
  });

  it('converts logLevel change to patch', () => {
    const patch = preferencePatchFromSettingChange('logLevel', 'debug');
    expect(patch?.logLevel).toBe('debug');
  });

  it('returns undefined for unknown id', () => {
    const patch = preferencePatchFromSettingChange('unknown', 'value');
    expect(patch).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败（因为 settingsViewModel 尚未生成 logLevel 项，且仍有 model:* 项）**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/utils/settingsViewModel.test.ts`

Expected: FAIL — logLevel 项不存在、model:* 项仍存在

- [ ] **Step 3: 实现 — 修改 settingsViewModel 删除 model:* 项、新增 logLevel 项**

修改 `frontend/src/app/utils/settingsViewModel.ts`，替换 `buildSettingsItems` 函数体：

```typescript
export function buildSettingsItems(t: CopyDict, appInfo: AppInfo | null): SettingItem[] {
  if (!appInfo) return [];
  const config = appInfo.config;
  const items: SettingItem[] = [];

  items.push({
    id: 'language',
    groupId: 'general',
    label: t.settingsLanguage,
    type: 'select',
    value: config.language,
    options: [
      { value: 'zh-CN', label: '中文' },
      { value: 'en-US', label: 'English' },
    ],
  });

  items.push({
    id: 'themeMode',
    groupId: 'general',
    label: t.settingsTheme,
    type: 'select',
    value: config.themeMode,
    options: [
      { value: 'system', label: t.settingsThemeSystem ?? 'System' },
      { value: 'light', label: t.settingsThemeLight ?? 'Light' },
      { value: 'dark', label: t.settingsThemeDark ?? 'Dark' },
    ],
  });

  const logModeOptions = [
    { value: 'overwrite', label: t.settingsLogModeOverwrite ?? 'Overwrite' },
    { value: 'append', label: t.settingsLogModeAppend ?? 'Append' },
    { value: 'multi', label: t.settingsLogModeMulti ?? 'Multi' },
  ];

  items.push({
    id: 'logLevel',
    groupId: 'general',
    label: t.settingsLogLevel ?? 'Log Level',
    description: t.settingsLogLevelDesc ?? 'Logging verbosity for app logs',
    type: 'select',
    value: config.logLevel,
    options: [
      { value: 'error', label: 'Error' },
      { value: 'warn', label: 'Warn' },
      { value: 'info', label: 'Info' },
      { value: 'debug', label: 'Debug' },
      { value: 'trace', label: 'Trace' },
    ],
  });

  items.push({
    id: 'terminalLogMode',
    groupId: 'general',
    label: t.settingsTerminalLogMode ?? 'Terminal Log Mode',
    type: 'select',
    value: config.terminalLogMode,
    options: logModeOptions,
  });

  items.push({
    id: 'debugLogMode',
    groupId: 'general',
    label: t.settingsDebugLogMode ?? 'Debug Log Mode',
    type: 'select',
    value: config.debugLogMode,
    options: logModeOptions,
  });

  return items;
}
```

修改 `preferencePatchFromSettingChange` 函数，删除 model:* 处理，新增 logLevel 等：

```typescript
export function preferencePatchFromSettingChange(
  id: string,
  value: string | boolean | number
): AppPreferencePatch | undefined {
  if (id === 'language') return { language: value as string };
  if (id === 'themeMode') return { themeMode: value as ThemeMode };
  if (id === 'logLevel') return { logLevel: value as string };
  if (id === 'terminalLogMode') return { terminalLogMode: value as LogMode };
  if (id === 'debugLogMode') return { debugLogMode: value as LogMode };
  return undefined;
}
```

更新 import：

```typescript
import type { ThemeMode, LogMode } from '../../shared/ipc-types.generated';
```

- [ ] **Step 4: 运行测试验证通过**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/utils/settingsViewModel.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/utils/settingsViewModel.ts frontend/src/app/utils/settingsViewModel.test.ts
git commit -m "fix(frontend): remove model:* settings items, add logLevel/terminalLogMode/debugLogMode items"
```

---

## Phase B：CSS + i18n + 无障碍修复

### Task 4: 修复 settings.css 硬编码与非标准 token（H2/H3/L5/M1）

**Files:**
- Modify: `frontend/src/styles/components/settings.css`（全文修复）

**Interfaces:**
- Consumes: 标准 token from `tokens.css`（`--text-*`、`--surface-*`、`--transition-*`、`--focus-ring*`）

- [ ] **Step 1: 修复硬编码颜色（H2）**

修改 `frontend/src/styles/components/settings.css:134`：

```css
/* 旧：.adl-settings-toggle__thumb { background: white; } */
.adl-settings-toggle__thumb {
  background: var(--text-inverse);
}
```

- [ ] **Step 2: 修复非标准 token（H3）**

全局替换 `settings.css` 中的 token：

```css
/* 旧 → 新 */
--bg-elevated  →  --surface-raised
--bg-hover     →  --surface-hover
--bg-active    →  --surface-active
--font-size-base  →  --text-base
--font-size-xs    →  --text-xs
--font-size-sm    →  --text-sm
```

使用 Edit 工具的 `replace_all` 模式逐个替换。

- [ ] **Step 3: 修复动画 token（L5）**

修改 `settings.css:122, 135`：

```css
/* 旧：transition: background 0.2s; */
transition: background var(--transition-colors);

/* 旧：transition: transform 0.2s; */
transition: transform var(--transition-transform);
```

- [ ] **Step 4: 添加 ToggleControl 焦点环（M1）**

在 `.adl-settings-toggle` 规则块中添加：

```css
.adl-settings-toggle:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--focus-ring-offset);
}
```

- [ ] **Step 5: 验证 — 运行 lint 与构建**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run lint && pnpm --dir frontend run build`

Expected: PASS（无 CSS 相关错误）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/styles/components/settings.css
git commit -m "fix(frontend): replace hardcoded colors and non-standard tokens in settings.css"
```

---

### Task 5: 修复 i18n 硬编码 + 新增设置专用 i18n 模块（H1）

**Files:**
- Create: `frontend/src/app/i18n/zh-CN/settings.ts`
- Create: `frontend/src/app/i18n/en-US/settings.ts`
- Modify: `frontend/src/app/i18n/zh-CN/index.ts`
- Modify: `frontend/src/app/i18n/en-US/index.ts`
- Modify: `frontend/src/app/i18n/zh-CN/models.ts`（移除已迁移键）
- Modify: `frontend/src/app/i18n/en-US/models.ts`（同步移除）
- Modify: `frontend/src/app/components/settings/SettingsControls.tsx:88`

**Interfaces:**
- Produces: 新 i18n 键 `settingsLogLevel`、`settingsTerminalLogMode`、`settingsDebugLogMode`、`settingsLogModeOverwrite/Append/Multi`、`settingsThemeSystem/Light/Dark`、`settingsShortcutsRecorded`、`settingsShortcutsPressKeys`、`settingsShortcutsConflict`、`settingsResetToDefault`、`settingsFontUi`、`settingsFontCode`、`settingsFontTerminal` 等

- [ ] **Step 1: 创建 zh-CN/settings.ts**

```typescript
const settings = {
  // 通用
  settingsTitle: '应用设置',
  settingsSearch: '搜索设置...',
  settingsResetToDefault: '恢复默认',
  settingsResetAll: '恢复全部默认',
  settingsNoResults: '无匹配设置项',

  // 分组标签
  settingsGeneral: '通用',
  settingsAgent: '智能体',
  settingsWorkspace: '工作区',
  settingsShortcuts: '快捷键',
  settingsMcp: 'MCP 服务器',
  settingsProviders: '模型供应商',
  settingsCommands: '自定义命令',
  settingsPermissions: '权限规则',
  settingsPlugins: '插件',
  settingsReferences: '引用',
  settingsLsp: '语言服务',

  // 通用设置项
  settingsLanguage: '语言',
  settingsTheme: '主题',
  settingsThemeSystem: '跟随系统',
  settingsThemeLight: '浅色',
  settingsThemeDark: '深色',
  settingsLogLevel: '日志级别',
  settingsLogLevelDesc: '应用日志的详细程度',
  settingsTerminalLogMode: '终端日志模式',
  settingsDebugLogMode: '调试日志模式',
  settingsLogModeOverwrite: '覆盖',
  settingsLogModeAppend: '追加',
  settingsLogModeMulti: '多文件',

  // 字体设置
  settingsFontUi: '界面字体',
  settingsFontCode: '代码字体',
  settingsFontTerminal: '终端字体',
  settingsFontPreview: '预览：The quick brown fox 1234567890',

  // 快捷键
  settingsShortcutsTitle: '快捷键设置',
  settingsShortcutsSearch: '搜索快捷键...',
  settingsShortcutsPressKeys: '按下快捷键...',
  settingsShortcutsUnassigned: '未设置',
  settingsShortcutsConflict: '快捷键冲突',
  settingsShortcutsConflictDesc: '快捷键 {keybind} 已被以下命令占用：{titles}',
  settingsShortcutsResetOne: '重置此项',
  settingsShortcutsClear: '清除',
  settingsShortcutsGroupGeneral: '通用',
  settingsShortcutsGroupSession: '会话',
  settingsShortcutsGroupNavigation: '导航',
  settingsShortcutsGroupModel: '模型与智能体',
  settingsShortcutsGroupTerminal: '终端',
  settingsShortcutsGroupPrompt: '提示词',

  // Toast
  settingsUpdated: '设置已更新',
  settingsUpdateFailed: '设置更新失败',
  settingsResetComplete: '已恢复默认设置',

  // 无障碍
  settingsToggleVisibility: '切换可见性',
  settingsSearchLabel: '搜索设置',
} as const;

export default settings;
```

- [ ] **Step 2: 创建 en-US/settings.ts**

```typescript
const settings = {
  settingsTitle: 'Application Settings',
  settingsSearch: 'Search settings...',
  settingsResetToDefault: 'Reset to default',
  settingsResetAll: 'Reset all to defaults',
  settingsNoResults: 'No matching settings',

  settingsGeneral: 'General',
  settingsAgent: 'Agent',
  settingsWorkspace: 'Workspace',
  settingsShortcuts: 'Shortcuts',
  settingsMcp: 'MCP Servers',
  settingsProviders: 'Model Providers',
  settingsCommands: 'Custom Commands',
  settingsPermissions: 'Permission Rules',
  settingsPlugins: 'Plugins',
  settingsReferences: 'References',
  settingsLsp: 'Language Server',

  settingsLanguage: 'Language',
  settingsTheme: 'Theme',
  settingsThemeSystem: 'System',
  settingsThemeLight: 'Light',
  settingsThemeDark: 'Dark',
  settingsLogLevel: 'Log Level',
  settingsLogLevelDesc: 'Verbosity of application logs',
  settingsTerminalLogMode: 'Terminal Log Mode',
  settingsDebugLogMode: 'Debug Log Mode',
  settingsLogModeOverwrite: 'Overwrite',
  settingsLogModeAppend: 'Append',
  settingsLogModeMulti: 'Multi-file',

  settingsFontUi: 'UI Font',
  settingsFontCode: 'Code Font',
  settingsFontTerminal: 'Terminal Font',
  settingsFontPreview: 'Preview: The quick brown fox 1234567890',

  settingsShortcutsTitle: 'Keyboard Shortcuts',
  settingsShortcutsSearch: 'Search shortcuts...',
  settingsShortcutsPressKeys: 'Press keys...',
  settingsShortcutsUnassigned: 'Unassigned',
  settingsShortcutsConflict: 'Shortcut Conflict',
  settingsShortcutsConflictDesc: 'Shortcut {keybind} is already used by: {titles}',
  settingsShortcutsResetOne: 'Reset this shortcut',
  settingsShortcutsClear: 'Clear',
  settingsShortcutsGroupGeneral: 'General',
  settingsShortcutsGroupSession: 'Session',
  settingsShortcutsGroupNavigation: 'Navigation',
  settingsShortcutsGroupModel: 'Model and Agent',
  settingsShortcutsGroupTerminal: 'Terminal',
  settingsShortcutsGroupPrompt: 'Prompt',

  settingsUpdated: 'Settings updated',
  settingsUpdateFailed: 'Failed to update settings',
  settingsResetComplete: 'Settings reset to defaults',

  settingsToggleVisibility: 'Toggle visibility',
  settingsSearchLabel: 'Search settings',
} as const;

export default settings;
```

- [ ] **Step 3: 修改 i18n 入口导入 settings 模块**

修改 `frontend/src/app/i18n/zh-CN/index.ts`，在 import 列表添加：

```typescript
import settings from './settings';
```

在合并对象中添加：

```typescript
export const zhCN = {
  ...common,
  ...models,
  ...settings,  // 新增
  // ...其他模块
} as const;
```

同样修改 `frontend/src/app/i18n/en-US/index.ts`。

- [ ] **Step 4: 从 models.ts 移除已迁移的键**

修改 `frontend/src/app/i18n/zh-CN/models.ts` 和 `en-US/models.ts`，删除以下已迁移到 settings.ts 的键：
- `settingsGeneral`、`settingsModel`、`settingsAgent`、`settingsWorkspace`、`settingsShortcuts`、`settingsMcp`、`settingsProviders`、`settingsCommands`、`settingsPermissions`、`settingsPlugins`、`settingsReferences`、`settingsLsp`
- `settingsSearch`、`settingsLanguage`、`settingsTheme`、`settingsAutoApproval`
- `settingsMaxSteps`、`settingsRetryCount`、`settingsExcludeRules`、`settingsIndexDepth`、`settingsGitIntegration`（L2 未使用键，直接删除）

- [ ] **Step 5: 修复 SettingsControls.tsx 硬编码 aria-label（H1）**

修改 `frontend/src/app/components/settings/SettingsControls.tsx:88`：

```tsx
// 旧：aria-label="Toggle visibility"
aria-label={t.settingsToggleVisibility}
```

需要确认 SettingsControls 已注入 `t`（useTCopy）。修改 `SettingsControls` 组件签名，接受 `t: CopyDict` prop 或在内部调用 `useTCopy()`。

- [ ] **Step 6: 运行 typecheck 验证**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/i18n/zh-CN/settings.ts frontend/src/app/i18n/en-US/settings.ts frontend/src/app/i18n/zh-CN/index.ts frontend/src/app/i18n/en-US/index.ts frontend/src/app/i18n/zh-CN/models.ts frontend/src/app/i18n/en-US/models.ts frontend/src/app/components/settings/SettingsControls.tsx
git commit -m "fix(frontend): extract settings i18n keys to dedicated module, fix hardcoded aria-label"
```

---

### Task 6: 无障碍修复 — SettingsNav 与搜索框（M2/M3/M4）

**Files:**
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx`
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:62-70`
- Modify: `frontend/src/styles/components/settings.css`（添加 nav 焦点与箭头导航样式）

**Interfaces:**
- Consumes: `aria-current="page"` 规范 from `ui-patterns.md §14`

- [ ] **Step 1: 修改 SettingsNav — 添加 aria-current 与箭头导航**

修改 `frontend/src/app/components/settings/SettingsNav.tsx`，重构 nav 容器与按钮：

```tsx
import { useRef, type KeyboardEvent } from 'react';
import type { SettingsGroupId } from '../../../kernel/types';
import type { CopyDict } from '../../i18n/types';
import styles from './SettingsNav.module.css';

interface SettingsNavProps {
  activeGroup: SettingsGroupId;
  onGroupChange: (group: SettingsGroupId) => void;
  groups: Array<{ id: SettingsGroupId; labelKey: keyof CopyDict }>;
  t: CopyDict;
}

export function SettingsNav({ activeGroup, onGroupChange, groups, t }: SettingsNavProps) {
  const navRef = useRef<HTMLElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const currentIndex = groups.findIndex((g) => g.id === activeGroup);
    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % groups.length;
    else if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + groups.length) % groups.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = groups.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    onGroupChange(groups[nextIndex].id);
    const buttons = navRef.current?.querySelectorAll('button');
    buttons?.[nextIndex]?.focus();
  };

  return (
    <nav
      ref={navRef}
      className="adl-settings-nav"
      aria-label={t.settingsTitle}
      aria-orientation="vertical"
      onKeyDown={handleKeyDown}
    >
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          className={`adl-settings-nav__item ${g.id === activeGroup ? 'is-active' : ''}`}
          aria-current={g.id === activeGroup ? 'page' : undefined}
          onClick={() => onGroupChange(g.id)}
        >
          {t[g.labelKey]}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: 修改 SettingsPanel — 搜索框添加 sr-only label**

修改 `frontend/src/app/components/settings/SettingsPanel.tsx:62-70`：

```tsx
<div className="adl-settings-search">
  <label htmlFor="adl-settings-search-input" className="sr-only">
    {t.settingsSearchLabel}
  </label>
  <input
    id="adl-settings-search-input"
    type="search"
    className="adl-settings-search__input"
    placeholder={t.settingsSearch}
    value={searchQuery}
    onChange={(e) => setSettingsSearchQuery(e.target.value)}
  />
</div>
```

- [ ] **Step 3: 添加 nav 箭头导航样式**

在 `settings.css` 末尾添加：

```css
.adl-settings-nav__item:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.adl-settings-search__input:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--focus-ring-offset);
}
```

- [ ] **Step 4: 验证 typecheck 与 lint**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/components/settings/SettingsNav.tsx frontend/src/app/components/settings/SettingsPanel.tsx frontend/src/styles/components/settings.css
git commit -m "fix(frontend): add aria-current, arrow-key nav, and sr-only label to settings panel"
```

---

### Task 7: 删除 model 分组 + 注册 CustomAgentSettings（H5/H6）

**Files:**
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx`（GROUPS 数组移除 model）
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:22-30`（SETTINGS_COMPONENTS 添加 agent → CustomAgentSettings）

**Interfaces:**
- Produces: `SettingsGroupId` 不再包含 `'model'`；'agent' 分组渲染 CustomAgentSettings

- [ ] **Step 1: 修改 SettingsNav — 移除 model 分组**

修改 `frontend/src/app/components/settings/SettingsNav.tsx`，从 GROUPS 数组中删除 `{ id: 'model', labelKey: 'settingsModel' }` 一行。

- [ ] **Step 2: 修改 SettingsPanel — 注册 CustomAgentSettings**

修改 `frontend/src/app/components/settings/SettingsPanel.tsx:22-30`，在 SETTINGS_COMPONENTS 添加：

```tsx
import { CustomAgentSettings } from '../../features/custom-agent/CustomAgentSettings';

const SETTINGS_COMPONENTS: Partial<Record<SettingsGroupId, React.ComponentType>> = {
  mcp: McpSettings,
  commands: CommandSettings,
  permissions: PermissionSettings,
  plugins: PluginSettings,
  references: ReferenceSettings,
  providers: ProviderSettings,
  lsp: LspSettings,
  agent: CustomAgentSettings,  // 新增
  shortcuts: KeybindSettings,  // 新增（Task 14 完成后）
};
```

注意：`shortcuts: KeybindSettings` 在 Task 14 完成前先注释，避免引入不存在的组件。

- [ ] **Step 3: 修改 settingsViewModel — 移除 approvalMode（已由 CustomAgentSettings 接管）**

修改 `frontend/src/app/utils/settingsViewModel.ts`，删除生成 `approvalMode` 和 `workspacePath` readonly 项的代码块（这些会由 CustomAgentSettings 组件提供更完整的 UI）。

- [ ] **Step 4: 验证 typecheck**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/components/settings/SettingsNav.tsx frontend/src/app/components/settings/SettingsPanel.tsx frontend/src/app/utils/settingsViewModel.ts
git commit -m "fix(frontend): remove model group (moved to providers), register CustomAgentSettings"
```

---

### Task 8: InputControl 添加 debounce（H7）

**Files:**
- Modify: `frontend/src/app/components/settings/SettingsControls.tsx`（InputControl）
- Test: `frontend/src/app/components/settings/SettingsControls.test.tsx`（新建）

**Interfaces:**
- Consumes: 500ms debounce（标准）
- Produces: InputControl 仅在用户停止输入 500ms 后调用 onChange

- [ ] **Step 1: 写失败测试 — InputControl debounce**

创建 `frontend/src/app/components/settings/SettingsControls.test.tsx`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InputControl } from './SettingsControls';

describe('InputControl', () => {
  it('debounces onChange by 500ms', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<InputControl id="test" value="" onChange={onChange} t={{} as never} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('abc');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/components/settings/SettingsControls.test.tsx`

Expected: FAIL — onChange 被调用 3 次（无 debounce）

- [ ] **Step 3: 实现 — 给 InputControl 添加 debounce**

修改 `frontend/src/app/components/settings/SettingsControls.tsx` 中 InputControl：

```tsx
import { useState, useEffect, useRef, type ChangeEvent } from 'react';

interface InputControlProps {
  id: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: 'text' | 'password';
  t: CopyDict;
}

export function InputControl({ id, value, onChange, placeholder, readOnly, type = 'text', t }: InputControlProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    if (readOnly) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(next);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <input
      id={id}
      type={type}
      className="adl-settings-input"
      value={localValue}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={handleChange}
    />
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/components/settings/SettingsControls.test.tsx`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/components/settings/SettingsControls.tsx frontend/src/app/components/settings/SettingsControls.test.tsx
git commit -m "fix(frontend): add 500ms debounce to InputControl to avoid excessive IPC calls"
```

---

## Phase C：全局 Toast store + 字体设置 + 恢复默认

### Task 9: 全局 Toast store

**Files:**
- Create: `frontend/src/app/stores/slices/toastSliceTypes.ts`
- Create: `frontend/src/app/stores/slices/toastSlice.ts`
- Modify: `frontend/src/app/stores/createStore.ts`（或合并入口）
- Modify: `frontend/src/app/App.tsx`（挂载全局 ToastContainer）

**Interfaces:**
- Consumes: `ToastData`、`ToastContainer` from `frontend/src/app/components/Toast.tsx`
- Produces: `useAppStore().toasts`、`useAppStore().showToast(message, type?)`、`useAppStore().removeToast(id)`

- [ ] **Step 1: 创建 toastSliceTypes.ts**

```typescript
import type { ToastType } from '../../components/Toast';

export interface ToastEntry {
  id: string;
  message: string;
  type?: ToastType;
  source?: string;
  duration?: number;
}

export interface ToastSliceState {
  toasts: ToastEntry[];
  showToast: (message: string, type?: ToastType, source?: string, duration?: number) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}
```

- [ ] **Step 2: 创建 toastSlice.ts**

```typescript
import type { StateCreator } from 'zustand';
import type { ToastSliceState, ToastEntry } from './toastSliceTypes';

let toastIdCounter = 0;
const nextToastId = () => `toast-${++toastIdCounter}`;

export const createToastSlice: StateCreator<ToastSliceState, [], [], ToastSliceState> = (set, get) => ({
  toasts: [],
  showToast: (message, type, source, duration) => {
    const id = nextToastId();
    const entry: ToastEntry = { id, message, type, source, duration };
    set((state) => ({ toasts: [...state.toasts, entry] }));
    return id;
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clearToasts: () => set({ toasts: [] }),
});
```

- [ ] **Step 3: 合并 toastSlice 到 store**

修改 `frontend/src/app/stores/createStore.ts`（或等价入口），import 并合并：

```typescript
import { createToastSlice } from './slices/toastSlice';
import type { ToastSliceState } from './slices/toastSliceTypes';

// 在 create<...>((...args) => ({
//   ...createUiSlice(...args),
//   ...createGeneralSlice(...args),
//   ...createToastSlice(...args),  // 新增
// }))
```

确保 `StoreState` 类型包含 `ToastSliceState`。

- [ ] **Step 4: 修改 App.tsx — 挂载全局 ToastContainer**

修改 `frontend/src/app/App.tsx`，在根组件树中添加：

```tsx
import { ToastContainer } from './components/Toast';
import { useAppStore } from './stores/createStore';

function App() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);
  // ...
  return (
    <>
      {/* 现有内容 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
```

- [ ] **Step 5: 验证 typecheck**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/stores/slices/toastSliceTypes.ts frontend/src/app/stores/slices/toastSlice.ts frontend/src/app/stores/createStore.ts frontend/src/app/App.tsx
git commit -m "feat(stores): add global toast slice for cross-feature feedback"
```

---

### Task 10: 扩展 Rust 后端 — 添加 keybinds 与 fonts 字段

**Files:**
- Modify: `crates/kernel/src/types/config.rs`（AppPreferencePatch + ConfigSnapshot + AppConfig）
- Modify: `src-tauri/src/commands/app.rs`（app_update_preferences 处理新字段）
- Modify: `frontend/src/shared/preferencesMerger.ts`（处理 keybinds/fonts）
- Test: `frontend/src/shared/preferencesMerger.test.ts`（追加测试）

**Interfaces:**
- Produces: `AppPreferencePatch.keybinds: Record<string, string> | null`、`AppPreferencePatch.fonts: FontPreferences | null`；`ConfigSnapshot.keybinds`、`ConfigSnapshot.fonts`

- [ ] **Step 1: 修改 Rust 类型 — 添加 FontPreferences 结构体与字段**

修改 `crates/kernel/src/types/config.rs`，在 AppPreferencePatch 之前添加：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
pub struct FontPreferences {
    pub ui_font: Option<String>,
    pub code_font: Option<String>,
    pub terminal_font: Option<String>,
}
```

修改 `AppPreferencePatch`，添加：

```rust
pub struct AppPreferencePatch {
    pub language: Option<String>,
    pub theme_mode: Option<ThemeMode>,
    pub log_level: Option<String>,
    pub terminal_log_mode: Option<LogMode>,
    pub debug_log_mode: Option<LogMode>,
    pub model_preferences: Option<std::collections::BTreeMap<ModelProviderId, ModelProviderPreferencePatch>>,
    pub keybinds: Option<std::collections::BTreeMap<String, String>>,
    pub fonts: Option<FontPreferences>,
}
```

修改 `AppConfig` 和 `ConfigSnapshot`，添加：

```rust
pub struct ConfigSnapshot {
    // ... 现有字段
    pub keybinds: std::collections::BTreeMap<String, String>,
    pub fonts: FontPreferences,
}
```

- [ ] **Step 2: 修改 app_update_preferences — 处理新字段**

修改 `src-tauri/src/commands/app.rs:80-135`，在 model_preferences 处理块后添加：

```rust
if let Some(keybinds) = &patch.keybinds {
    config.keybinds = keybinds.clone();
}
if let Some(fonts) = &patch.fonts {
    if let Some(ui) = &fonts.ui_font { config.fonts.ui_font = Some(ui.clone()); }
    if let Some(code) = &fonts.code_font { config.fonts.code_font = Some(code.clone()); }
    if let Some(term) = &fonts.terminal_font { config.fonts.terminal_font = Some(term.clone()); }
}
```

同时确保 `AppConfig::default()` 初始化 `keybinds: BTreeMap::new()` 和 `fonts: FontPreferences::default()`。

- [ ] **Step 3: 重新生成 ts-rs 类型**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test --workspace -p adl-kernel --lib
```

Expected: 成功生成更新后的 `ipc-types.generated.ts`，包含 `FontPreferences`、`keybinds`、`fonts` 字段。

- [ ] **Step 4: 修改 preferencesMerger — 处理 keybinds/fonts**

修改 `frontend/src/shared/preferencesMerger.ts`，在 modelPreferences 处理块后添加：

```typescript
  if (patch.keybinds) {
    nextConfig.keybinds = { ...patch.keybinds };
  }
  if (patch.fonts) {
    nextConfig.fonts = {
      ...nextConfig.fonts,
      ...(patch.fonts.uiFont !== null && patch.fonts.uiFont !== undefined ? { uiFont: patch.fonts.uiFont } : {}),
      ...(patch.fonts.codeFont !== null && patch.fonts.codeFont !== undefined ? { codeFont: patch.fonts.codeFont } : {}),
      ...(patch.fonts.terminalFont !== null && patch.fonts.terminalFont !== undefined ? { terminalFont: patch.fonts.terminalFont } : {}),
    };
  }
```

- [ ] **Step 5: 追加 preferencesMerger 测试**

在 `frontend/src/shared/preferencesMerger.test.ts` 追加：

```typescript
  it('applies keybinds patch', () => {
    const patch: AppPreferencePatch = { keybinds: { 'command.openSettings': 'mod+comma' } };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.keybinds['command.openSettings']).toBe('mod+comma');
  });

  it('applies fonts patch', () => {
    const patch: AppPreferencePatch = { fonts: { uiFont: 'Inter', codeFont: null, terminalFont: null } };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.fonts.uiFont).toBe('Inter');
  });
```

- [ ] **Step 6: 运行测试验证通过**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/shared/preferencesMerger.test.ts`

Expected: PASS

- [ ] **Step 7: 验证 Rust 编译**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check --workspace
```

Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add crates/kernel/src/types/config.rs src-tauri/src/commands/app.rs frontend/src/shared/ipc-types.generated.ts frontend/src/shared/preferencesMerger.ts frontend/src/shared/preferencesMerger.test.ts
git commit -m "feat(ipc): add keybinds and fonts fields to AppPreferencePatch for configurable shortcuts and fonts"
```

---

### Task 11: 字体设置 UI + 实时预览

**Files:**
- Create: `frontend/src/app/components/settings/FontControl.tsx`
- Modify: `frontend/src/app/utils/settingsViewModel.ts`（新增 font 项）
- Modify: `frontend/src/styles/tokens.css`（新增 `--font-sans-custom`/`--font-mono-custom` 变量）
- Modify: `frontend/src/styles/components/settings.css`（FontControl 样式）

**Interfaces:**
- Consumes: `ConfigSnapshot.fonts` from `ipc-types.generated.ts`
- Produces: 三个 font 设置项（uiFont/codeFont/terminalFont），实时修改 CSS 变量

- [ ] **Step 1: 修改 tokens.css — 新增可覆盖的字体变量**

修改 `frontend/src/styles/tokens.css:35-42`，将字体变量改为可被覆盖：

```css
:root {
  --font-sans:
    var(--font-sans-custom, 'Inter'), -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei',
    'Noto Sans SC', 'Helvetica Neue', Arial, sans-serif;
  --font-mono:
    var(--font-mono-custom, 'JetBrains Mono'), 'Fira Code', 'Cascadia Code', 'Consolas', 'Menlo', 'Liberation Mono',
    'Courier New', monospace;
  --font-display: var(--font-sans);
}
```

这样 JS 只需设置 `--font-sans-custom` / `--font-mono-custom` 即可覆盖首选字体，回退链保留。

- [ ] **Step 2: 创建 FontControl.tsx**

```tsx
import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import type { CopyDict } from '../../i18n/types';

interface FontControlProps {
  id: string;
  value: string;
  cssVar: '--font-sans-custom' | '--font-mono-custom';
  onChange: (value: string) => void;
  t: CopyDict;
}

export function FontControl({ id, value, cssVar, onChange, t }: FontControlProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
    document.documentElement.style.setProperty(cssVar, value || null);
  }, [value, cssVar]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    document.documentElement.style.setProperty(cssVar, next || null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(next), 500);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="adl-settings-font">
      <input
        id={id}
        type="text"
        className="adl-settings-font__input"
        value={localValue}
        placeholder="Inter"
        onChange={handleChange}
      />
      <div className="adl-settings-font__preview">{t.settingsFontPreview}</div>
    </div>
  );
}
```

- [ ] **Step 3: 修改 settingsViewModel — 新增字体设置项**

在 `frontend/src/app/utils/settingsViewModel.ts` 的 buildSettingsItems 末尾添加：

```typescript
  if (config.fonts) {
    items.push({
      id: 'font:ui',
      groupId: 'general',
      label: t.settingsFontUi,
      type: 'font',
      value: config.fonts.uiFont ?? '',
      cssVar: '--font-sans-custom',
    } as SettingItem);
    items.push({
      id: 'font:code',
      groupId: 'general',
      label: t.settingsFontCode,
      type: 'font',
      value: config.fonts.codeFont ?? '',
      cssVar: '--font-mono-custom',
    } as SettingItem);
    items.push({
      id: 'font:terminal',
      groupId: 'general',
      label: t.settingsFontTerminal,
      type: 'font',
      value: config.fonts.terminalFont ?? '',
      cssVar: '--font-mono-custom',
    } as SettingItem);
  }
```

需要扩展 `SettingItem` 类型（kernel/types.ts）添加 `type: 'font'` 和 `cssVar?` 字段。

- [ ] **Step 4: 修改 preferencePatchFromSettingChange — 处理 font:* id**

```typescript
  if (id.startsWith('font:')) {
    const fontKey = id.slice(5); // 'ui' | 'code' | 'terminal'
    const fonts = patch.fonts ?? { uiFont: null, codeFont: null, terminalFont: null };
    if (fontKey === 'ui') fonts.uiFont = value as string;
    if (fontKey === 'code') fonts.codeFont = value as string;
    if (fontKey === 'terminal') fonts.terminalFont = value as string;
    return { fonts };
  }
```

- [ ] **Step 5: 修改 SettingsControls — 渲染 FontControl**

在 `frontend/src/app/components/settings/SettingsControls.tsx` 添加 FontControl 路由：

```tsx
import { FontControl } from './FontControl';

// 在 switch (item.type) 中添加
case 'font':
  return (
    <FontControl
      id={item.id}
      value={String(item.value)}
      cssVar={item.cssVar ?? '--font-sans-custom'}
      onChange={(v) => onChange(item.id, v)}
      t={t}
    />
  );
```

- [ ] **Step 6: 添加 FontControl 样式**

在 `settings.css` 添加：

```css
.adl-settings-font {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.adl-settings-font__input {
  padding: 4px 8px;
  background: var(--surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: var(--text-sm);
}

.adl-settings-font__preview {
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: 4px 8px;
  background: var(--surface-subtle);
  border-radius: 4px;
}
```

- [ ] **Step 7: 验证 typecheck 与 lint**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`

Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add frontend/src/styles/tokens.css frontend/src/app/components/settings/FontControl.tsx frontend/src/app/utils/settingsViewModel.ts frontend/src/app/components/settings/SettingsControls.tsx frontend/src/styles/components/settings.css frontend/src/kernel/types.ts
git commit -m "feat(frontend): add font settings with live preview via CSS custom properties"
```

---

### Task 12: 恢复默认功能

**Files:**
- Create: `frontend/src/shared/defaultPreferences.ts`
- Create: `frontend/src/shared/defaultPreferences.test.ts`
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx`（添加"恢复全部默认"按钮）
- Modify: `frontend/src/app/components/settings/SettingsControls.tsx`（每个 item 添加"重置"按钮）

**Interfaces:**
- Produces: `getDefaultPreferences()` 返回 `AppPreferencePatch`；UI 提供"恢复全部默认"和单条重置

- [ ] **Step 1: 创建 defaultPreferences.ts**

```typescript
import type { AppPreferencePatch } from './ipc-types.generated';

export const DEFAULT_LANGUAGE = 'zh-CN';
export const DEFAULT_THEME_MODE = 'system' as const;
export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_TERMINAL_LOG_MODE = 'overwrite' as const;
export const DEFAULT_DEBUG_LOG_MODE = 'overwrite' as const;
export const DEFAULT_KEYBINDS: Record<string, string> = {
  'session.new': 'mod+shift+n',
  'workspace.new': 'mod+n',
  'workspace.open': 'mod+o',
  'settings.open': 'mod+shift+comma',
};
export const DEFAULT_FONTS = {
  uiFont: null,
  codeFont: null,
  terminalFont: null,
};

export function getDefaultPreferences(): AppPreferencePatch {
  return {
    language: DEFAULT_LANGUAGE,
    themeMode: DEFAULT_THEME_MODE,
    logLevel: DEFAULT_LOG_LEVEL,
    terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
    debugLogMode: DEFAULT_DEBUG_LOG_MODE,
    keybinds: { ...DEFAULT_KEYBINDS },
    fonts: { ...DEFAULT_FONTS },
    modelPreferences: null,
  };
}

export function getDefaultForSetting(id: string): string | boolean | number | undefined {
  switch (id) {
    case 'language': return DEFAULT_LANGUAGE;
    case 'themeMode': return DEFAULT_THEME_MODE;
    case 'logLevel': return DEFAULT_LOG_LEVEL;
    case 'terminalLogMode': return DEFAULT_TERMINAL_LOG_MODE;
    case 'debugLogMode': return DEFAULT_DEBUG_LOG_MODE;
    case 'font:ui':
    case 'font:code':
    case 'font:terminal':
      return '';
    default: return undefined;
  }
}
```

- [ ] **Step 2: 创建 defaultPreferences.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { getDefaultPreferences, getDefaultForSetting, DEFAULT_KEYBINDS } from './defaultPreferences';

describe('defaultPreferences', () => {
  it('returns full patch with all defaults', () => {
    const defaults = getDefaultPreferences();
    expect(defaults.language).toBe('zh-CN');
    expect(defaults.themeMode).toBe('system');
    expect(defaults.logLevel).toBe('info');
  });

  it('getDefaultForSetting returns correct value per id', () => {
    expect(getDefaultForSetting('language')).toBe('zh-CN');
    expect(getDefaultForSetting('themeMode')).toBe('system');
    expect(getDefaultForSetting('unknown')).toBeUndefined();
  });

  it('DEFAULT_KEYBINDS includes settings.open', () => {
    expect(DEFAULT_KEYBINDS['settings.open']).toBeDefined();
  });
});
```

- [ ] **Step 3: 运行测试验证通过**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/shared/defaultPreferences.test.ts`

Expected: PASS

- [ ] **Step 4: 修改 SettingsPanel — 添加"恢复全部默认"按钮**

修改 `frontend/src/app/components/settings/SettingsPanel.tsx` header 区域：

```tsx
import { getDefaultPreferences } from '../../../shared/defaultPreferences';

// 在 header 中添加
<button
  type="button"
  className="adl-settings-reset-all"
  onClick={() => {
    const defaults = getDefaultPreferences();
    actions.updatePreferences(defaults);
    showToast(t.settingsResetComplete, 'success');
  }}
>
  {t.settingsResetAll}
</button>
```

- [ ] **Step 5: 修改 SettingsControls — 每行添加单条重置按钮**

在 SettingsControls 的每行渲染中添加重置图标按钮：

```tsx
import { getDefaultForSetting } from '../../../shared/defaultPreferences';

// 在每行末尾添加
{item.type !== 'readonly' && getDefaultForSetting(item.id) !== undefined && (
  <button
    type="button"
    className="adl-settings-row__reset"
    aria-label={t.settingsResetToDefault}
    title={t.settingsResetToDefault}
    onClick={() => onChange(item.id, getDefaultForSetting(item.id)!)}
  >
    <IconReset aria-hidden="true" />
  </button>
)}
```

- [ ] **Step 6: 添加样式**

在 `settings.css` 添加：

```css
.adl-settings-reset-all {
  padding: 4px 12px;
  background: var(--surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-colors);
}

.adl-settings-reset-all:hover {
  background: var(--surface-hover);
}

.adl-settings-row__reset {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
}

.adl-settings-row__reset:hover {
  background: var(--surface-hover);
  color: var(--text-secondary);
}
```

- [ ] **Step 7: 验证 typecheck**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`

Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add frontend/src/shared/defaultPreferences.ts frontend/src/shared/defaultPreferences.test.ts frontend/src/app/components/settings/SettingsPanel.tsx frontend/src/app/components/settings/SettingsControls.tsx frontend/src/styles/components/settings.css
git commit -m "feat(frontend): add reset-to-default for individual settings and reset-all button"
```

---

## Phase D：命令注册中心 + 快捷键录制

### Task 13: 命令注册中心

**Files:**
- Create: `frontend/src/shared/keybinds.ts`
- Create: `frontend/src/shared/keybinds.test.ts`
- Create: `frontend/src/app/commands/commandRegistry.ts`
- Create: `frontend/src/app/commands/commandRegistry.test.ts`
- Create: `frontend/src/app/commands/defaultCommands.ts`
- Create: `frontend/src/app/commands/useCommandRegistry.ts`

**Interfaces:**
- Produces: `CommandMeta { id, title, group, defaultKeybind? }`、`commandRegistry.register(list)`、`commandRegistry.getAll()`、`commandRegistry.getById(id)`、`useCommandRegistry()` hook

- [ ] **Step 1: 创建 keybinds.ts 纯函数**

```typescript
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export function isModifier(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

export function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    ',': 'comma',
    '+': 'plus',
    ' ': 'space',
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'Enter': 'enter',
    'Escape': 'escape',
    'Backspace': 'backspace',
    'Delete': 'delete',
    'Tab': 'tab',
  };
  return map[key] ?? key.toLowerCase();
}

export function recordKeybind(event: KeyboardEvent): string | null {
  const key = event.key;
  if (isModifier(key)) return null;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('mod');
  if (isMac ? event.ctrlKey : event.metaKey) parts.push(isMac ? 'ctrl' : 'meta');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  parts.push(normalizeKey(key));
  return parts.join('+');
}

export function parseKeybind(keybind: string): string[] {
  if (!keybind || keybind === 'none') return [];
  return keybind.split('+').map((p) => p.trim().toLowerCase());
}

export function signatures(keybind: string | undefined): string[] {
  if (!keybind) return [];
  const parts = parseKeybind(keybind);
  if (parts.length === 0) return [];
  // 主签名 = 排序后的完整组合
  return [parts.slice().sort().join('+')];
}

export function formatKeybind(keybind: string | undefined): string {
  if (!keybind || keybind === 'none') return '';
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  return keybind
    .split('+')
    .map((p) => {
      if (p === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (p === 'ctrl') return isMac ? '⌃' : 'Ctrl';
      if (p === 'meta') return isMac ? '⌘' : 'Win';
      if (p === 'alt') return isMac ? '⌥' : 'Alt';
      if (p === 'shift') return isMac ? '⇧' : 'Shift';
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(isMac ? '' : '+');
}
```

- [ ] **Step 2: 创建 keybinds.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { isModifier, normalizeKey, parseKeybind, signatures, formatKeybind } from './keybinds';

describe('keybinds', () => {
  it('isModifier detects modifier keys', () => {
    expect(isModifier('Control')).toBe(true);
    expect(isModifier('Shift')).toBe(true);
    expect(isModifier('A')).toBe(false);
  });

  it('normalizeKey maps special keys', () => {
    expect(normalizeKey(',')).toBe('comma');
    expect(normalizeKey('ArrowUp')).toBe('up');
    expect(normalizeKey('A')).toBe('a');
  });

  it('parseKeybind splits parts', () => {
    expect(parseKeybind('mod+shift+p')).toEqual(['mod', 'shift', 'p']);
    expect(parseKeybind('none')).toEqual([]);
  });

  it('signatures returns sorted signature for conflict detection', () => {
    expect(signatures('mod+shift+p')).toEqual(['mod+shift+p']);
    expect(signatures('shift+mod+p')).toEqual(['mod+shift+p']); // 顺序无关
    expect(signatures(undefined)).toEqual([]);
  });

  it('formatKeybind formats for display', () => {
    const result = formatKeybind('mod+shift+p');
    expect(result).toBeTruthy();
    expect(formatKeybind('none')).toBe('');
    expect(formatKeybind(undefined)).toBe('');
  });
});
```

- [ ] **Step 3: 运行测试验证通过**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/shared/keybinds.test.ts`

Expected: PASS

- [ ] **Step 4: 创建 defaultCommands.ts**

```typescript
import type { CopyDict } from '../i18n/types';

export type CommandGroup = 'general' | 'session' | 'navigation' | 'model' | 'terminal' | 'prompt';

export interface CommandMeta {
  id: string;
  titleKey: keyof CopyDict;
  group: CommandGroup;
  defaultKeybind?: string;
}

export const DEFAULT_COMMANDS: CommandMeta[] = [
  { id: 'session.new', titleKey: 'settingsShortcutsGroupSession', group: 'session', defaultKeybind: 'mod+shift+n' },
  { id: 'workspace.new', titleKey: 'settingsShortcutsGroupNavigation', group: 'navigation', defaultKeybind: 'mod+n' },
  { id: 'workspace.open', titleKey: 'settingsShortcutsGroupNavigation', group: 'navigation', defaultKeybind: 'mod+o' },
  { id: 'settings.open', titleKey: 'settingsGeneral', group: 'general', defaultKeybind: 'mod+shift+comma' },
  // 可继续扩展
];
```

- [ ] **Step 5: 创建 commandRegistry.ts**

```typescript
import { DEFAULT_COMMANDS, type CommandMeta } from './defaultCommands';

class CommandRegistry {
  private commands = new Map<string, CommandMeta>();
  private listeners = new Set<() => void>();

  constructor() {
    this.register(DEFAULT_COMMANDS);
  }

  register(list: CommandMeta[]): void {
    for (const cmd of list) {
      this.commands.set(cmd.id, cmd);
    }
    this.emit();
  }

  getAll(): CommandMeta[] {
    return Array.from(this.commands.values());
  }

  getById(id: string): CommandMeta | undefined {
    return this.commands.get(id);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}

export const commandRegistry = new CommandRegistry();
```

- [ ] **Step 6: 创建 commandRegistry.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { commandRegistry } from './commandRegistry';

describe('commandRegistry', () => {
  it('initializes with default commands', () => {
    const all = commandRegistry.getAll();
    expect(all.length).toBeGreaterThan(0);
    expect(commandRegistry.getById('settings.open')).toBeDefined();
  });

  it('supports subscribe', () => {
    let called = false;
    const unsub = commandRegistry.subscribe(() => { called = true; });
    commandRegistry.register([{ id: 'test.cmd', titleKey: 'settingsGeneral', group: 'general' }]);
    expect(called).toBe(true);
    unsub();
  });
});
```

- [ ] **Step 7: 创建 useCommandRegistry.ts**

```typescript
import { useSyncExternalStore } from 'react';
import { commandRegistry } from './commandRegistry';
import type { CommandMeta } from './defaultCommands';

export function useCommandRegistry(): CommandMeta[] {
  return useSyncExternalStore(
    (listener) => commandRegistry.subscribe(listener),
    () => commandRegistry.getAll(),
    () => commandRegistry.getAll()
  );
}
```

- [ ] **Step 8: 运行所有测试验证通过**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/shared/keybinds.test.ts src/app/commands/commandRegistry.test.ts`

Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add frontend/src/shared/keybinds.ts frontend/src/shared/keybinds.test.ts frontend/src/app/commands/
git commit -m "feat(frontend): add command registry and keybind pure functions for configurable shortcuts"
```

---

### Task 14: useKeyCapture hook + KeybindSettings 组件

**Files:**
- Create: `frontend/src/app/hooks/useKeyCapture.ts`
- Create: `frontend/src/app/hooks/useKeyCapture.test.ts`
- Create: `frontend/src/app/components/settings/KeybindControl.tsx`
- Create: `frontend/src/app/components/settings/KeybindSettings.tsx`
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx`（SETTINGS_COMPONENTS 添加 shortcuts → KeybindSettings）
- Modify: `frontend/src/app/hooks/useKeyboardShortcuts.ts`（改用 commandRegistry 驱动）

**Interfaces:**
- Consumes: `commandRegistry`、`recordKeybind`、`signatures`、`useAppStore().appInfo.config.keybinds`、`useAppStore().showToast`
- Produces: `KeybindSettings` 组件作为 shortcuts 分组的渲染组件

- [ ] **Step 1: 创建 useKeyCapture.ts**

```typescript
import { useEffect, useRef } from 'react';
import { recordKeybind, signatures } from '../../shared/keybinds';
import type { CommandMeta } from '../commands/defaultCommands';

interface UseKeyCaptureArgs {
  activeId: string | null;
  commands: CommandMeta[];
  keybinds: Record<string, string>;
  onRecord: (id: string, keybind: string) => void;
  onConflict: (keybind: string, conflictingTitles: string[]) => void;
  onStop: () => void;
}

export function useKeyCapture({ activeId, commands, keybinds, onRecord, onConflict, onStop }: UseKeyCaptureArgs) {
  const argsRef = useRef({ activeId, commands, keybinds, onRecord, onConflict, onStop });
  argsRef.current = { activeId, commands, keybinds, onRecord, onConflict, onStop };

  useEffect(() => {
    if (activeId === null) return;
    const handle = (event: KeyboardEvent) => {
      const args = argsRef.current;
      if (args.activeId === null) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.key === 'Escape') { args.onStop(); return; }

      const isClear = (event.key === 'Backspace' || event.key === 'Delete')
        && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      if (isClear) { args.onRecord(args.activeId, 'none'); args.onStop(); return; }

      const next = recordKeybind(event);
      if (!next) return;

      // 冲突检测
      const newSigs = signatures(next);
      const conflicts = new Map<string, string>();
      for (const cmd of args.commands) {
        if (cmd.id === args.activeId) continue;
        const existing = args.keybinds[cmd.id];
        if (!existing) continue;
        const existingSigs = signatures(existing);
        for (const sig of newSigs) {
          if (existingSigs.includes(sig)) {
            conflicts.set(cmd.id, cmd.id);
          }
        }
      }
      if (conflicts.size > 0) {
        args.onConflict(next, Array.from(conflicts.values()));
        return;
      }

      args.onRecord(args.activeId, next);
      args.onStop();
    };
    document.addEventListener('keydown', handle, { capture: true });
    return () => document.removeEventListener('keydown', handle, { capture: true });
  }, [activeId]);
}
```

- [ ] **Step 2: 创建 KeybindControl.tsx**

```tsx
import { formatKeybind } from '../../../shared/keybinds';
import type { CopyDict } from '../../i18n/types';

interface KeybindControlProps {
  keybind: string | undefined;
  isRecording: boolean;
  onStartRecord: () => void;
  t: CopyDict;
}

export function KeybindControl({ keybind, isRecording, onStartRecord, t }: KeybindControlProps) {
  return (
    <button
      type="button"
      className={`adl-settings-keybind ${isRecording ? 'is-recording' : ''}`}
      onClick={onStartRecord}
      aria-label={isRecording ? t.settingsShortcutsPressKeys : (keybind ? formatKeybind(keybind) : t.settingsShortcutsUnassigned)}
    >
      {isRecording ? t.settingsShortcutsPressKeys : (keybind && keybind !== 'none' ? formatKeybind(keybind) : t.settingsShortcutsUnassigned)}
    </button>
  );
}
```

- [ ] **Step 3: 创建 KeybindSettings.tsx**

```tsx
import { useState, useMemo } from 'react';
import { useCommandRegistry } from '../../commands/useCommandRegistry';
import { useKeyCapture } from '../../hooks/useKeyCapture';
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';
import { formatKeybind } from '../../../shared/keybinds';
import { KeybindControl } from './KeybindControl';
import { getDefaultForSetting } from '../../../shared/defaultPreferences';
import type { CommandGroup } from '../../commands/defaultCommands';

const GROUP_ORDER: CommandGroup[] = ['general', 'session', 'navigation', 'model', 'terminal', 'prompt'];
const GROUP_LABEL_KEY: Record<CommandGroup, string> = {
  general: 'settingsShortcutsGroupGeneral',
  session: 'settingsShortcutsGroupSession',
  navigation: 'settingsShortcutsGroupNavigation',
  model: 'settingsShortcutsGroupModel',
  terminal: 'settingsShortcutsGroupTerminal',
  prompt: 'settingsShortcutsGroupPrompt',
};

export function KeybindSettings() {
  const t = useTCopy().t;
  const commands = useCommandRegistry();
  const appInfo = useAppStore((s) => s.appInfo);
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const showToast = useAppStore((s) => s.showToast);
  const keybinds = appInfo?.config?.keybinds ?? {};
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return commands;
    const lower = search.toLowerCase();
    return commands.filter((c) => c.id.toLowerCase().includes(lower) || c.titleKey.toLowerCase().includes(lower));
  }, [commands, search]);

  const grouped = useMemo(() => {
    const map = new Map<CommandGroup, typeof commands>();
    for (const cmd of filtered) {
      const list = map.get(cmd.group) ?? [];
      list.push(cmd);
      map.set(cmd.group, list);
    }
    return GROUP_ORDER.map((g) => ({ group: g, items: map.get(g) ?? [] })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const handleRecord = (id: string, keybind: string) => {
    updatePreferences({ keybinds: { ...keybinds, [id]: keybind } });
  };

  const handleConflict = (keybind: string, titles: string[]) => {
    showToast(t.settingsShortcutsConflictDesc.replace('{keybind}', formatKeybind(keybind)).replace('{titles}', titles.join(', ')), 'warning');
  };

  useKeyCapture({
    activeId: recordingId,
    commands,
    keybinds,
    onRecord: handleRecord,
    onConflict: handleConflict,
    onStop: () => setRecordingId(null),
  });

  return (
    <div className="adl-settings-keybinds">
      <div className="adl-settings-keybinds__header">
        <h4 className="adl-settings-keybinds__title">{t.settingsShortcutsTitle}</h4>
        <input
          type="search"
          className="adl-settings-keybinds__search"
          placeholder={t.settingsShortcutsSearch}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {grouped.map(({ group, items }) => (
        <section key={group} className="adl-settings-keybinds__group">
          <h5 className="adl-settings-keybinds__group-title">
            {t[GROUP_LABEL_KEY[group] as keyof typeof t] ?? group}
          </h5>
          {items.map((cmd) => (
            <div key={cmd.id} className="adl-settings-keybinds__row">
              <div className="adl-settings-keybinds__row-label">
                {t[cmd.titleKey as keyof typeof t] ?? cmd.id}
              </div>
              <KeybindControl
                keybind={keybinds[cmd.id] ?? cmd.defaultKeybind}
                isRecording={recordingId === cmd.id}
                onStartRecord={() => setRecordingId(cmd.id)}
                t={t}
              />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 修改 SettingsPanel — 注册 shortcuts 分组**

修改 `frontend/src/app/components/settings/SettingsPanel.tsx:22-30`，添加：

```tsx
import { KeybindSettings } from './KeybindSettings';

const SETTINGS_COMPONENTS: Partial<Record<SettingsGroupId, React.ComponentType>> = {
  mcp: McpSettings,
  commands: CommandSettings,
  permissions: PermissionSettings,
  plugins: PluginSettings,
  references: ReferenceSettings,
  providers: ProviderSettings,
  lsp: LspSettings,
  agent: CustomAgentSettings,
  shortcuts: KeybindSettings,  // 新增
};
```

- [ ] **Step 5: 修改 useKeyboardShortcuts — 改用 commandRegistry 驱动**

修改 `frontend/src/app/hooks/useKeyboardShortcuts.ts`，重构为从 commandRegistry + appInfo.config.keybinds 驱动：

```typescript
import { useEffect } from 'react';
import { commandRegistry } from '../commands/commandRegistry';
import { parseKeybind } from '../../shared/keybinds';
import { useAppStore } from '../stores/createStore';

interface ActionCallbacks {
  openNewSessionDialog: () => void;
  openCreateWorkspaceDialog: () => void;
  openWorkspace: () => void;
  openSettings: () => void;
}

const COMMAND_HANDLERS: Record<string, (cb: ActionCallbacks) => void> = {
  'session.new': (cb) => cb.openNewSessionDialog(),
  'workspace.new': (cb) => cb.openCreateWorkspaceDialog(),
  'workspace.open': (cb) => cb.openWorkspace(),
  'settings.open': (cb) => cb.openSettings(),
};

export function useKeyboardShortcuts(callbacks: ActionCallbacks) {
  const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds ?? {});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const parts: string[] = [];
      if (isMac ? e.metaKey : e.ctrlKey) parts.push('mod');
      if (isMac ? e.ctrlKey : e.metaKey) parts.push(isMac ? 'ctrl' : 'meta');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');
      const keyName = e.key.toLowerCase();
      parts.push(keyName);
      const pressed = parts.slice().sort().join('+');

      for (const cmd of commandRegistry.getAll()) {
        const kb = keybinds[cmd.id] ?? cmd.defaultKeybind;
        if (!kb || kb === 'none') continue;
        const sig = parseKeybind(kb).slice().sort().join('+');
        if (sig === pressed) {
          e.preventDefault();
          COMMAND_HANDLERS[cmd.id]?.(callbacks);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keybinds, callbacks]);
}
```

修改 `App.tsx` 中调用 `useKeyboardShortcuts` 的地方，传入 `openSettings` 回调（切换右侧面板到 settings 工具）。

- [ ] **Step 6: 添加 KeybindSettings 样式**

在 `settings.css` 添加：

```css
.adl-settings-keybinds__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.adl-settings-keybinds__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
}

.adl-settings-keybinds__search {
  flex: 1;
  padding: 4px 8px;
  background: var(--surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: var(--text-sm);
}

.adl-settings-keybinds__group {
  margin-bottom: var(--space-4);
}

.adl-settings-keybinds__group-title {
  margin: 0 0 var(--space-1) 0;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.adl-settings-keybinds__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.adl-settings-keybinds__row-label {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.adl-settings-keybind {
  padding: 4px 12px;
  min-width: 120px;
  background: var(--surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: center;
  transition: background var(--transition-colors), border-color var(--transition-colors);
}

.adl-settings-keybind:hover {
  background: var(--surface-hover);
}

.adl-settings-keybind.is-recording {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-strong);
}

.adl-settings-keybind:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--focus-ring-offset);
}
```

- [ ] **Step 7: 验证 typecheck 与 lint**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`

Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add frontend/src/app/hooks/useKeyCapture.ts frontend/src/app/components/settings/KeybindControl.tsx frontend/src/app/components/settings/KeybindSettings.tsx frontend/src/app/components/settings/SettingsPanel.tsx frontend/src/app/hooks/useKeyboardShortcuts.ts frontend/src/styles/components/settings.css frontend/src/app/App.tsx
git commit -m "feat(frontend): add keyboard shortcut recording with conflict detection (shortcuts group)"
```

---

## Phase E：收尾与一致性

### Task 15: 独立设置组件风格统一（M7）

**Files:**
- Modify: `frontend/src/app/features/provider-manager/ProviderSettings.tsx`
- Modify: `frontend/src/app/features/plugin-manager/PluginSettings.tsx`
- Modify: `frontend/src/app/features/reference-manager/ReferenceSettings.tsx`
- Modify: `frontend/src/app/features/custom-agent/CustomAgentSettings.tsx`
- Create: `frontend/src/app/components/settings/SettingsHeader.tsx`（通用 header 组件）

**Interfaces:**
- Produces: 所有独立设置组件统一使用 `<SettingsHeader title={...} action={...} />`

- [ ] **Step 1: 创建 SettingsHeader.tsx**

```tsx
import type { ReactNode } from 'react';
import type { CopyDict } from '../../i18n/types';

interface SettingsHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  t: CopyDict;
}

export function SettingsHeader({ title, description, action }: SettingsHeaderProps) {
  return (
    <div className="adl-settings-header">
      <div className="adl-settings-header__text">
        <h3 className="adl-settings-header__title">{title}</h3>
        {description && <p className="adl-settings-header__desc">{description}</p>}
      </div>
      {action && <div className="adl-settings-header__action">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: 修改 4 个独立组件 — 使用 SettingsHeader**

以 `ProviderSettings.tsx` 为例，在组件顶部添加：

```tsx
import { SettingsHeader } from '../../components/settings/SettingsHeader';

// 在 return 中
return (
  <div className="adl-provider-settings">
    <SettingsHeader
      title={t.settingsProviders}
      description={t.settingsProvidersDesc}
      action={<button onClick={handleAdd}>{t.providerAdd}</button>}
      t={t}
    />
    {/* 现有内容 */}
  </div>
);
```

同样修改 PluginSettings、ReferenceSettings、CustomAgentSettings。

- [ ] **Step 3: 添加 SettingsHeader 样式**

在 `settings.css` 添加：

```css
.adl-settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.adl-settings-header__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.adl-settings-header__desc {
  margin: var(--space-1) 0 0 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
```

- [ ] **Step 4: 验证 typecheck**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/components/settings/SettingsHeader.tsx frontend/src/app/features/provider-manager/ProviderSettings.tsx frontend/src/app/features/plugin-manager/PluginSettings.tsx frontend/src/app/features/reference-manager/ReferenceSettings.tsx frontend/src/app/features/custom-agent/CustomAgentSettings.tsx frontend/src/styles/components/settings.css
git commit -m "fix(frontend): unify settings sub-component headers with SettingsHeader component"
```

---

### Task 16: 最终验收 — 全量测试 + Lint + 类型检查

**Files:** 无修改，仅执行验收

- [ ] **Step 1: 前端 ESLint + Prettier**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
```

Expected: 无错误

- [ ] **Step 2: 前端类型检查 + 全量测试**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

Expected: PASS

- [ ] **Step 3: Rust rustfmt + clippy + 编译**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
```

Expected: PASS

- [ ] **Step 4: Rust 测试**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --workspace
```

Expected: PASS

- [ ] **Step 5: 三端桥接一致性检查**

人工检查 `tauri-bridge.ts`、`preview-bridge/preview-model.ts`、`mock-bridge.ts` 三端的 `updatePreferences` 实现是否一致（参数类型、返回类型、错误处理）。

- [ ] **Step 6: 最终提交（如有 lint 修复）**

```bash
git add -A
git commit -m "chore(frontend): apply lint fixes from final acceptance"
```

---

## Self-Review Checklist

实施完成后，按此清单逐项验证：

### Spec 覆盖率
- [x] C1 类型契约不一致 → Task 1
- [x] C2 updatePreferences 错误处理 → Task 2
- [x] C3 settingsViewModel 测试 → Task 3
- [x] H1 i18n 硬编码 → Task 5
- [x] H2 颜色硬编码 → Task 4
- [x] H3 非标准 token → Task 4
- [x] H4 shortcuts 分组 → Task 13/14
- [x] H5 CustomAgentSettings 未注册 → Task 7
- [x] H6 model/providers 重复 → Task 7
- [x] H7 input 无 debounce → Task 8
- [x] M1 焦点环 → Task 4
- [x] M2 aria-current → Task 6
- [x] M3 箭头导航 → Task 6
- [x] M4 sr-only label → Task 6
- [x] M5 搜索覆盖独立组件 → 已通过 Task 14 的 KeybindSettings 内置搜索缓解（其他独立组件搜索暂不实现，避免过度复杂）
- [x] M6 类型双源 → Task 1
- [x] M7 独立组件风格不一致 → Task 15
- [x] L1 i18n 键位置 → Task 5
- [x] L2 未使用 i18n 键 → Task 5
- [x] L3 恢复默认 → Task 12
- [x] L5 transition token → Task 4
- [x] 字体设置（补全） → Task 11
- [x] 日志级别设置（补全） → Task 3
- [x] Toast 反馈（补全） → Task 9
- [x] 快捷键录制 + 冲突检测（补全） → Task 13/14

### Placeholder Scan
所有步骤均包含完整代码，无 "TBD"/"TODO"/"add appropriate error handling" 占位符。

### Type Consistency
- `AppPreferencePatch` 在所有 Task 中均引用自 `ipc-types.generated.ts`
- `CommandMeta` 在 Task 13/14 中一致
- `ToastEntry` 在 Task 9 中定义，App.tsx 消费
- `KeybindSettings` 在 Task 14 定义，Task 7 注册（顺序：Task 7 在 Task 14 之前，但 SETTINGS_COMPONENTS 中的 `shortcuts: KeybindSettings` 在 Task 14 Step 4 添加）

### 已知未实现项（明确说明）
- **M5 搜索覆盖独立组件**：保持现状（仅搜索 SettingsControls 渲染的项），因为 MCP/commands 等独立组件内部已有自己的搜索/过滤。强行全局搜索会引入复杂的状态同步，收益不大。
- **主题 hover 预览**：未单独实现 Task。ThemeController 当前不支持 preview/cancelPreview 模式，引入会破坏现有主题切换流程。建议作为后续独立任务。
- **声音/通知设置**：用户选择"修复 + 核心补全"，本项目无对应后端基础设施，不引入。

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-07-06-settings-panel-overhaul.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
