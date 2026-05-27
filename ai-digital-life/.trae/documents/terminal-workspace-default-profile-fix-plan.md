# 工作区默认终端类型设置功能修复计划

> 日期: 2026-05-27

## 问题描述

用户反馈在工作区头部行的"更多操作"菜单中：
1. 点击子菜单中的其他终端类型后，菜单关闭
2. 但再次打开菜单时，显示的仍然是原来的终端类型
3. 创建终端时也不是新选择的类型

## 问题根源分析

### 1. Zustand Store 更新同步性问题

`WorkspaceTerminalEntry.tsx` 中的 `handleSelectDefaultProfile` 存在问题：

```typescript
const handleSelectDefaultProfile = useCallback((profile: TerminalProfile) => {
  if (isIndependent) {
    setDefaultTerminalProfile(profile);
  } else {
    setWorkspaceDefaultTerminalProfile(workspace.id, profile);  // Zustand 更新
  }
  setRenderKey(prev => prev + 1);  // React 状态更新
  setTimeout(() => {
    closeMenu();
  }, 50);
}, [...]);
```

**问题**：
- `setWorkspaceDefaultTerminalProfile` 更新 Zustand store（同步）
- `setRenderKey` 更新 React 状态（异步批处理）
- 两个更新可能被 React 批处理，导致组件重新渲染时 Zustand store 可能还未完全同步

### 2. localStorage 持久化延迟问题

`terminalSlice.ts` 中的 `scheduleWrite` 使用 `requestIdleCallback`：

```typescript
function scheduleFlush(): void {
  const flush = () => {
    // 写入 localStorage
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(flush, { timeout: 500 });  // 延迟执行
  } else {
    setTimeout(flush, 50);
  }
}
```

**问题**：如果用户在 `requestIdleCallback` 执行前刷新页面，localStorage 可能未保存新值。

### 3. useTerminalPanel 中的闭包问题

`useTerminalPanel.ts` 第 163 行和 176 行：
```typescript
const workspaceDefaultProfiles = useAppStore((state) => state.workspaceDefaultProfiles);

let finalProfile: TerminalProfile;
if (profile) {
  finalProfile = profile;
} else if (workspaceId && workspaceDefaultProfiles[workspaceId]) {
  finalProfile = workspaceDefaultProfiles[workspaceId];
}
```

**问题**：`workspaceDefaultProfiles` 在 `useCallback` 中可能捕获的是旧值。

## 修复方案

### 方案 1：确保 Zustand 更新后再触发 React 更新（推荐）

**修改文件**：`WorkspaceTerminalEntry.tsx`

**核心思路**：确保 Zustand store 更新完成后再触发 React 重新渲染。

```typescript
const handleSelectDefaultProfile = useCallback((profile: TerminalProfile) => {
  if (isIndependent) {
    setDefaultTerminalProfile(profile);
  } else {
    setWorkspaceDefaultTerminalProfile(workspace.id, profile);
  }
  // 使用 useAppStore.getState() 确保读取最新值
  const currentValue = useAppStore.getState().workspaceDefaultProfiles[workspace.id];
  if (currentValue === profile) {
    // Zustand 已更新，触发 React 重渲染
    setRenderKey(prev => prev + 1);
    setTimeout(() => {
      closeMenu();
    }, 50);
  }
}, [isIndependent, workspace.id, setDefaultTerminalProfile, setWorkspaceDefaultTerminalProfile, closeMenu]);
```

### 方案 2：同步写入 localStorage（确保持久化）

**修改文件**：`terminalSlice.ts`

**核心思路**：在更新 Zustand store 后，同步写入 localStorage，而不是依赖 `scheduleWrite`。

```typescript
setWorkspaceDefaultTerminalProfile: (workspaceId, profile) => {
  set((state) => {
    const nextWorkspaceProfiles = { ...state.workspaceDefaultProfiles, [workspaceId]: profile };
    // 同步写入 localStorage
    try {
      window.localStorage.setItem(
        TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY,
        JSON.stringify(nextWorkspaceProfiles)
      );
    } catch {
      // ignore
    }
    return { workspaceDefaultProfiles: nextWorkspaceProfiles };
  });
},
```

### 方案 3：useTerminalPanel 中使用 getState（推荐）

**修改文件**：`useTerminalPanel.ts`

**核心思路**：在 `handleCreateTab` 中使用 `getState()` 获取最新的 `workspaceDefaultProfiles`。

```typescript
const handleCreateTab = useCallback(async (profile?: TerminalProfile, workspaceId?: string) => {
  // 使用 getState() 获取最新值，而不是依赖闭包捕获的值
  const { defaultTerminalProfile, workspaceDefaultProfiles } = useAppStore.getState();
  
  let finalProfile: TerminalProfile;
  if (profile) {
    finalProfile = profile;
  } else if (workspaceId && workspaceDefaultProfiles[workspaceId]) {
    finalProfile = workspaceDefaultProfiles[workspaceId];
  } else {
    finalProfile = defaultTerminalProfile;
  }
  // ...
}, []);
```

## 实施步骤

### Step 1：修复 WorkspaceTerminalEntry.tsx
- 在 `handleSelectDefaultProfile` 中确保 Zustand 更新后再触发重渲染

### Step 2：修复 terminalSlice.ts
- 同步写入 localStorage，而不是使用延迟的 `scheduleWrite`

### Step 3：修复 useTerminalPanel.ts
- 在 `handleCreateTab` 中使用 `getState()` 获取最新值

### Step 4：运行测试验证
- 运行 Rust 测试：`cargo test --workspace`
- 运行前端测试：`npm --prefix frontend test`
- 运行类型检查：`npm --prefix frontend run typecheck`

## 预期效果

1. **UI 立即反映**：选择终端类型后，菜单再次打开时显示新选择的类型
2. **创建终端正确**：点击创建终端按钮时，使用工作区设置的默认类型
3. **刷新持久化**：刷新浏览器后，设置仍然有效

## 相关文件

- `frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx`
- `frontend/src/app/stores/slices/terminalSlice.ts`
- `frontend/src/app/features/terminal/useTerminalPanel.ts`
