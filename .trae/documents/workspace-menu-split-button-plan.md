# 工作区菜单复合按钮实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将状态栏工作区菜单的"打开路径"区域重构为复合分割按钮（SplitButton），包含"选择文件夹/打开文件夹/创建文件夹"三种模式，支持路径验证错误显示、条件输入框、⋮ 设置面板和 localStorage 持久化。

**Architecture:** 在 StatusBar.tsx 内部实现 SplitButton 组件（复合按钮 + 条件输入框 + ⋮ 设置面板）。通过 localStorage 持久化模式选择和默认目录。文案变更集中在 copy.ts。CSS 样式追加到 regions.css。

**Tech Stack:** React 19 + TypeScript + CSS (regions.css) + Zustand store

---

### Task 1: copy.ts — 新增/修改文案

**Files:**
- Modify: `frontend/src/app/copy.ts` (lines 149-152 for zh-CN, lines 641-644 for en-US)

- [ ] **Step 1.1: 修改中文文案**

在 `copy.ts` 中找到 `zh-CN` 区块的以下行（约第 149-152 行）：
- `workspaceOpenTitle: "打开路径"` → `workspaceOpenTitle: "打开工作空间"`
- `workspacePickDirectory: "选择文件夹"` → 保持不变（但 serve 不同的用途）

在 `workspaceNewCreate` 之后追加以下新 key：

```typescript
// 在 "workspaceNewCreate: '创建并打开'," 之后添加:
workspaceOpenFolder: "打开文件夹",
workspaceCreateFolder: "创建文件夹",
workspaceCreateDefaultDir: "默认创建工作空间目录",
workspaceCreateDirDescName: "输入工作空间名称时：",
workspaceCreateDirDescNameDetail: "将在默认目录下创建同名文件夹并打开，例：{name} → {path}",
workspaceCreateDirDescFull: "输入完整路径时：",
workspaceCreateDirDescFullDetail: "如果路径不存在，自动递归创建目录并打开，例：{path} → 自动创建",
workspaceCreateDirDescExists: "路径已存在时：",
workspaceCreateDirDescExistsDetail: "直接打开，不清空不覆盖现有内容",
workspaceOpenInputPlaceholder: "输入工作空间路径（路径必须存在）",
workspaceCreateInputPlaceholder: "输入路径或名称（如 my-project）",
workspacePathNotFound: "路径不存在，请检查后重试",
workspaceSaveSettings: "保存设置",
```

- [ ] **Step 1.2: 修改英文文案**

在 `copy.ts` 中找到 `en-US` 区块的以下行（约第 641-644 行）：
- `workspaceOpenTitle: "Open path"` → `workspaceOpenTitle: "Open workspace"`
- `workspacePickDirectory: "Pick folder"` → 保持不变

在 `workspaceNewCreate: "Create & open"` 之后追加：

```typescript
workspaceOpenFolder: "Open folder",
workspaceCreateFolder: "Create folder",
workspaceCreateDefaultDir: "Default workspace directory",
workspaceCreateDirDescName: "When entering a workspace name:",
workspaceCreateDirDescNameDetail: "A folder will be created under the default directory, e.g. {name} → {path}",
workspaceCreateDirDescFull: "When entering a full path:",
workspaceCreateDirDescFullDetail: "If the path does not exist, it will be created recursively, e.g. {path} → auto-create",
workspaceCreateDirDescExists: "When the path already exists:",
workspaceCreateDirDescExistsDetail: "It will be opened directly without clearing or overwriting",
workspaceOpenInputPlaceholder: "Enter workspace path (path must exist)",
workspaceCreateInputPlaceholder: "Enter path or name (e.g. my-project)",
workspacePathNotFound: "Path does not exist, please check and try again",
workspaceSaveSettings: "Save settings",
```

---

### Task 2: StatusBar.tsx — 添加 SplitButton 所需的 state 和 handler

**Files:**
- Modify: `frontend/src/app/regions/StatusBar.tsx` (lines 129-140, 231-243)

- [ ] **Step 2.1: 添加新的 state 变量**

在现有 state 之后（`const [pendingBranchAction, setPendingBranchAction] = useState<PendingBranchAction>();` 后面）添加：

```typescript
const [actionMode, setActionMode] = useState<WorkspaceActionMode>(() => {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("adl_workspace_menu_mode") : null;
  return (saved === "pick" || saved === "open" || saved === "create") ? saved : "pick";
});
const [actionDraft, setActionDraft] = useState("");
const [actionError, setActionError] = useState("");
const [settingPanelOpen, setSettingPanelOpen] = useState(false);
const [defaultCreateDir, setDefaultCreateDir] = useState(() => {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("adl_workspace_default_create_dir") || "";
});
const [createDirDraft, setCreateDirDraft] = useState("");
```

在文件顶部 import 区域添加 `WorkspaceActionMode` 类型定义。可以使用局部 type：

```typescript
type WorkspaceActionMode = "pick" | "open" | "create";
```

- [ ] **Step 2.2: 替换 handleOpenPath / handlePickDirectory handler**

删除现有的 `handleOpenPath` 和 `handlePickDirectory` 函数（约第 231-243 行），替换为：

```typescript
const handlePickDirectory = async () => {
  const selectedPath = await onPickWorkspaceDirectory();
  if (!selectedPath) return;
  await onOpenWorkspace(selectedPath);
  setOpenMenu(undefined);
};

const handleOpenWorkspaceByPath = async (path: string) => {
  const normalized = path.trim();
  if (!normalized) return;
  setActionError("");
  const result = await onOpenWorkspace(normalized);
  if (!result.ok) {
    setActionError(t.workspacePathNotFound);
  } else {
    setOpenMenu(undefined);
  }
};

const handleCreateWorkspace = async (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return;
  setActionError("");
  const isSimpleName = !/[\\/]/.test(trimmed);
  let resolvedPath: string;
  if (isSimpleName && defaultCreateDir) {
    resolvedPath = `${defaultCreateDir.replace(/\\/g, "/").replace(/\/+$/, "")}/${trimmed}`;
  } else {
    resolvedPath = trimmed;
  }
  const result = await onOpenWorkspace(resolvedPath);
  if (!result.ok) {
    setActionError(result.error || t.workspacePathNotFound);
  } else {
    setOpenMenu(undefined);
  }
};

const handleSplitMainAction = () => {
  if (actionMode === "pick") {
    void handlePickDirectory();
  } else if (actionMode === "open") {
    void handleOpenWorkspaceByPath(actionDraft);
  } else if (actionMode === "create") {
    void handleCreateWorkspace(actionDraft);
  }
};
```

- [ ] **Step 2.3: 添加 mode 切换和设置保存 handler**

在 `handleSplitMainAction` 之后添加：

```typescript
const handleActionModeChange = (mode: WorkspaceActionMode) => {
  setActionMode(mode);
  setActionError("");
  setSettingPanelOpen(false);
  try { localStorage.setItem("adl_workspace_menu_mode", mode); } catch {}
};

const handleOpenSettings = () => {
  setCreateDirDraft(defaultCreateDir);
  setSettingPanelOpen((prev) => !prev);
};

const handleSaveCreateDir = () => {
  const dir = createDirDraft.trim();
  setDefaultCreateDir(dir);
  try { localStorage.setItem("adl_workspace_default_create_dir", dir); } catch {}
  setSettingPanelOpen(false);
};
```

- [ ] **Step 2.4: 更新 StatusBarProps 接口**

将 `onOpenWorkspace: (workspacePath: string) => void;` 改为：

```typescript
onOpenWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
```

---

### Task 3: StatusBar.tsx — 替换 JSX 中的工作区菜单区域

**Files:**
- Modify: `frontend/src/app/regions/StatusBar.tsx` (lines 351-374, 即从 `<div className="adl-statusbar__menu-section">` 开始到第 374 行的 `</div>`)

- [ ] **Step 3.1: 替换 JSX 区块**

将第 351-374 行（整个"打开路径" section）替换为以下内容：

```tsx
            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.workspaceOpenTitle}</strong>

              {/* Split button */}
              <div className="adl-split-btn" style={{ position: "relative" }}>
                <button
                  type="button"
                  className="adl-split-btn__main"
                  onClick={handleSplitMainAction}
                >
                  {actionMode === "create" ? (
                    <IconFolder size={14} />
                  ) : (
                    <IconFolderOpen size={14} />
                  )}
                  {actionMode === "pick" && t.workspacePickDirectory}
                  {actionMode === "open" && t.workspaceOpenFolder}
                  {actionMode === "create" && t.workspaceCreateFolder}
                </button>
                <button
                  type="button"
                  className="adl-split-btn__drop"
                  onClick={() => {
                    setActionError("");
                    setSettingPanelOpen(false);
                    setOpenMenu((current) => (current === "split" ? undefined : "split"));
                  }}
                  aria-haspopup="menu"
                >
                  <IconChevronRight size={12} />
                </button>
                {openMenu === "split" ? (
                  <div className="adl-split-btn__menu">
                    <button
                      type="button"
                      className={`adl-split-btn__option${actionMode === "pick" ? " is-active" : ""}`}
                      onClick={() => { handleActionModeChange("pick"); setOpenMenu(undefined); }}
                    >
                      <IconFolderOpen size={14} />
                      <span>{t.workspacePickDirectory}</span>
                    </button>
                    <button
                      type="button"
                      className={`adl-split-btn__option${actionMode === "open" ? " is-active" : ""}`}
                      onClick={() => { handleActionModeChange("open"); setOpenMenu(undefined); }}
                    >
                      <IconFolderOpen size={14} />
                      <span>{t.workspaceOpenFolder}</span>
                    </button>
                    <button
                      type="button"
                      className={`adl-split-btn__option${actionMode === "create" ? " is-active" : ""}`}
                      onClick={() => { handleActionModeChange("create"); setOpenMenu(undefined); }}
                    >
                      <IconFolder size={14} />
                      <span>{t.workspaceCreateFolder}</span>
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Conditional input for open mode */}
              {actionMode === "open" ? (
                <div className="adl-split-btn__input-area">
                  <input
                    className={`adl-split-btn__input${actionError ? " adl-split-btn__input--error" : ""}`}
                    value={actionDraft}
                    onChange={(e) => { setActionDraft(e.currentTarget.value); if (actionError) setActionError(""); }}
                    placeholder={t.workspaceOpenInputPlaceholder}
                    onKeyDown={(e) => { if (e.key === "Enter") handleOpenWorkspaceByPath(actionDraft); }}
                  />
                  {actionError ? <p className="adl-split-btn__error">{actionError}</p> : null}
                </div>
              ) : null}

              {/* Conditional input for create mode */}
              {actionMode === "create" ? (
                <div className="adl-split-btn__input-area">
                  <div className="adl-split-btn__input-row">
                    <input
                      className={`adl-split-btn__input${actionError ? " adl-split-btn__input--error" : ""}`}
                      value={actionDraft}
                      onChange={(e) => { setActionDraft(e.currentTarget.value); if (actionError) setActionError(""); }}
                      placeholder={t.workspaceCreateInputPlaceholder}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreateWorkspace(actionDraft); }}
                    />
                    <button
                      type="button"
                      className="adl-split-btn__dots"
                      onClick={handleOpenSettings}
                      title={t.workspaceCreateDefaultDir}
                    >
                      <span>⋮</span>
                    </button>
                  </div>
                  {actionError ? <p className="adl-split-btn__error">{actionError}</p> : null}

                  {/* Settings panel */}
                  {settingPanelOpen ? (
                    <div className="adl-split-btn__settings">
                      <strong className="adl-split-btn__settings-title">{t.workspaceCreateDefaultDir}</strong>
                      <div className="adl-split-btn__input-row">
                        <input
                          className="adl-split-btn__input"
                          value={createDirDraft}
                          onChange={(e) => setCreateDirDraft(e.currentTarget.value)}
                          placeholder={t.workspacePlaceholder}
                        />
                        <button
                          type="button"
                          className="adl-split-btn__dots"
                          onClick={() => {
                            void onPickWorkspaceDirectory().then((path) => {
                              if (path) setCreateDirDraft(path);
                            });
                          }}
                        >
                          <IconFolderOpen size={14} />
                        </button>
                      </div>
                      <div className="adl-split-btn__settings-desc">
                        <p><strong>{t.workspaceCreateDirDescName}</strong></p>
                        <p>{t.workspaceCreateDirDescNameDetail.replace("{name}", "my-project").replace("{path}", defaultCreateDir ? `${defaultCreateDir}/my-project` : "默认目录/my-project")}</p>
                        <p><strong>{t.workspaceCreateDirDescFull}</strong></p>
                        <p>{t.workspaceCreateDirDescFullDetail}</p>
                        <p><strong>{t.workspaceCreateDirDescExists}</strong></p>
                        <p>{t.workspaceCreateDirDescExistsDetail}</p>
                      </div>
                      <button
                        type="button"
                        className="adl-btn adl-btn--sm"
                        onClick={handleSaveCreateDir}
                      >
                        {t.workspaceSaveSettings}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
```

- [ ] **Step 3.2: 更新外部点击/ESC 关闭逻辑**

在现有 `setOpenMenu(undefined)` 的外部点击处理中添加 `setSettingPanelOpen(false)`。当前第 193 行已有 `setPendingBranchAction(undefined);`，在其后添加 `setSettingPanelOpen(false);`。

---

### Task 4: regions.css — 添加 SplitButton 相关样式

**Files:**
- Modify: `frontend/src/styles/regions.css`

- [ ] **Step 4.1: 添加 SplitButton 样式**

在文件末尾（PromptModal 相关样式之后）追加：

```css
/* === Split Button (workspace menu) === */
.adl-split-btn {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: visible;
  position: relative;
}

.adl-split-btn__main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}

.adl-split-btn__main:hover {
  background: rgba(255,255,255,0.06);
}

.adl-split-btn__drop {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  padding: 6px 0;
  background: transparent;
  border: none;
  border-left: 1px solid var(--border);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 10px;
  font-family: inherit;
  transition: background 0.15s;
}

.adl-split-btn__drop:hover {
  background: rgba(255,255,255,0.06);
}

.adl-split-btn__menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  z-index: 15;
}

.adl-split-btn__option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s;
}

.adl-split-btn__option:hover {
  background: rgba(255,255,255,0.06);
}

.adl-split-btn__option.is-active {
  background: rgba(124, 58, 237, 0.15);
  color: var(--accent);
}

.adl-split-btn__input-area {
  margin-top: 8px;
}

.adl-split-btn__input-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.adl-split-btn__input {
  flex: 1;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.adl-split-btn__input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.25);
}

.adl-split-btn__input--error {
  border-color: var(--danger, #ef4444);
}

.adl-split-btn__input--error:focus {
  border-color: var(--danger, #ef4444);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
}

.adl-split-btn__error {
  margin: 4px 0 0;
  font-size: var(--text-xs, 11px);
  color: var(--danger, #ef4444);
  line-height: 1.4;
}

.adl-split-btn__dots {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  font-family: inherit;
  transition: background 0.15s;
  flex-shrink: 0;
}

.adl-split-btn__dots:hover {
  background: rgba(255,255,255,0.06);
}

.adl-split-btn__settings {
  margin-top: 8px;
  padding: 12px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.adl-split-btn__settings-title {
  display: block;
  font-size: 12px;
  color: var(--text-bright);
  margin-bottom: 6px;
}

.adl-split-btn__settings-desc {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-dim);
}

.adl-split-btn__settings-desc strong {
  color: var(--text);
  display: block;
  margin-top: 4px;
}

.adl-split-btn__settings-desc strong:first-child {
  margin-top: 0;
}
```

---

### Task 5: store.ts — 确认 openWorkspace 返回类型

**Files:**
- Read: `frontend/src/app/store.ts` (lines 389-402)

- [ ] **Step 5.1: 确认返回类型**

读取 store.ts 中 `openWorkspace` 函数的实现，确认其返回类型为 `Promise<{ ok: boolean; error?: string }>`。如果不是，修改返回类型和实现以确保它返回 `{ ok: true }` 或 `{ ok: false, error: "..." }`。

预期类型签名应为：

```typescript
openWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
```

---

### Task 6: typecheck + 测试验证

- [ ] **Step 6.1: 运行 typecheck**

```bash
npm run frontend:typecheck
```
Expected: No new type errors. Only the same pre-existing errors should remain.

- [ ] **Step 6.2: 运行测试**

```bash
npm run frontend:test
```
Expected: No new test failures. Only the same pre-existing failures should remain.

---

### Task 7: 清理 — 删除 mockup 文件

- [ ] **Step 7.1: 删除不再需要的 mockup HTML**

```bash
del "E:\Programs\Obsidian\notes\ai-digital-life\frontend\public\workspace-menu-mockup.html"
```
