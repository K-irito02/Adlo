# UI 测试策略 (Testing Strategy)

> 实现 UI 组件的单元测试和视觉回归测试方案

## 1. 测试分层

```
┌─────────────────────────────────────────────────┐
│                E2E 测试（少量）                  │
│  完整用户流程: 打开工作区 → 索引 → 查看任务     │
├─────────────────────────────────────────────────┤
│              集成测试                            │
│  组件协作: Form + Validation + ErrorBoundary    │
├─────────────────────────────────────────────────┤
│              单元测试（核心）                    │
│  每个组件的 Props / 状态 / 事件 / A11y          │
├─────────────────────────────────────────────────┤
│              视觉回归测试                         │
│  截图对比: 每种主题/状态下的组件截图一致性       │
└─────────────────────────────────────────────────┘
```

## 2. 单元测试

### 2.1 测试框架选型

| 工具 | 用途 |
|------|------|
| **Vitest** | 测试运行器（与 Vite 项目原生集成） |
| **@testing-library/react** | 组件渲染与交互模拟 |
| **@testing-library/jest-dom** | DOM 断言扩展 |
| **@testing-library/user-event** | 模拟真实用户操作（键盘、鼠标） |
| **msw (Mock Service Worker)** | Mock IPC 调用 |

### 2.2 核心组件测试覆盖要求

#### Button 组件测试清单

```typescript
describe('Button', () => {
  // 渲染
  it('renders with text content', () => { ... });
  it('renders with icon', () => { ... });
  it('renders with both icon and text', () => { ... });

  // 变体
  it('applies primary variant styles', () => { ... });
  it('applies danger variant styles', () => { ... });
  it('applies ghost variant styles', () => { ... });
  it('applies size variants (sm/md/lg)', () => { ... });

  // 状态
  it('is disabled when disabled prop is true', () => { ... });
  it('shows spinner when loading is true', () => { ... });
  it('does not fire onClick when disabled', () => { ... });
  it('does not fire onClick when loading', () => { ... });

  // 交互
  it('fires onClick when clicked', () => { ... });
  it('handles keyboard Enter activation', () => { ... });
  it('handles keyboard Space activation', () => { ... });

  // A11y
  it('has correct role="button"', () => { ... });
  it('has visible focus ring on keyboard focus', () => { ... });
  it('supports aria-label for icon-only buttons', () => { ... });
  it('has aria-disabled when disabled', () => { ... });
});
```

#### 通用测试覆盖矩阵

| 测试维度 | 所有组件必须覆盖 |
|----------|-------------------|
| **渲染** | 默认态、所有 variant、所有 size |
| **Props 传递** | className、data-testid、id 等 |
| **交互事件** | onClick / onChange / onSubmit 正确触发 |
| **禁用态** | disabled 时不可交互 + 视觉变化 |
| **加载态** | loading 时显示 spinner + 禁止重复点击 |
| **键盘操作** | Tab 可聚焦、Enter/Space 可激活 |
| **Focus Ring** | 键盘聚焦时有可见 outline |
| **ARIA 属性** | 正确的 role / aria-label / aria-* |
| **Theme 适配** | 在至少 2 种配色下验证颜色正确性 |

### 2.3 A11y 专项测试

```typescript
describe('Accessibility', () => {
  it('all interactive elements are reachable via Tab', () => {
    const { container } = render(<MyComponent />);
    const interactives = getAllByRole(container, /^(button|link|textbox|select|checkbox|radio)$/);
    
    // 模拟完整 Tab 循环
    interactives.forEach((el, i) => {
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(document.activeElement).toBe(interactives[(i + 1) % interactives.length]);
    });
  });

  it('icon-only buttons have aria-label', async () => {
    const { container } = render(<IconButton icon="x" />);
    const btn = getByRole(container, 'button');
    expect(btn).toHaveAttribute('aria-label');
  });

  it('meets color contrast requirements', () => {
    // 使用 axe-core 或手动检查对比度
    const backgroundColor = getComputedStyle(container).backgroundColor;
    const textColor = getComputedStyle(textElement).color;
    expect(getContrastRatio(backgroundColor, textColor)).toBeGreaterThanOrEqual(4.5);
  });
});
```

## 3. 视觉回归测试

### 3.1 工具选型

| 工具 | 用途 |
|------|------|
| **Playwright** | 截图 + 对比（跨平台） |
| **Storybook** | 组件展示 + 截图基准 |
| **Chromatic** (可选) | 云端视觉回归托管服务 |

### 3.2 截图策略

#### 每个组件需要截图的场景

| 场景 | 说明 |
|------|------|
| Default State | 默认 props 渲染结果 |
| All Variants | 每个 variant 一张截图 |
| All Sizes | sm / md / lg 各一张 |
| Hover State | mouse hover 效果 |
| Focus State | keyboard focus 效果 |
| Active/Pressed State | 鼠标按下效果 |
| Disabled State | 禁用态外观 |
| Loading State | 加载中外观 |
| Empty State | 无内容时外观 |
| Error State | 错误态外观 |
| Long Content | 内容溢出时的处理 |
| **× 5 color schemes** | 每种配色各一套 |
| **× 2 theme modes** | Light / Dark 各一套 |

**单组件最大截图数**: ~15 states × 5 schemes × 2 themes = **150 张**

### 3.3 容差配置

```typescript
// playwright.config.ts 视觉回归配置
{
  expect(snapshot).toMatchSnapshot({
    maxDiffPixelRatio: 0.01,      // 允许 1% 像素差异（抗锯齿等）
    threshold: 0.2,               // 允许 20% 的像素差异率
    animation: 'disabled',        // 禁用动画以获得稳定截图
    clip: fullPage                // 全页面截图
  });
}
```

### 3.4 多环境一致性

| 环境 | 要求 |
|------|------|
| Windows | 主力开发平台，必须通过 |
| macOS | 字体渲染可能不同，允许微差异 |
| Linux | 字体栈可能不同，允许微差异 |
| HiDPI (2x) | 高分屏截图必须通过 |
| 不同缩放 (100%/125%/150%) | 必须在主要缩放下通过 |

## 4. 集成测试

### 4.1 关键集成场景

| 场景 | 测试内容 |
|------|----------|
| **表单提交流程** | 输入 → 校验 → 提交 → 成功/错误反馈 → Toast 显示 |
| **Modal 流程** | 打开 → Focus trap → 内容交互 → Escape 关闭 → 回调触发 |
| **主题切换流程** | 选择配色 → 选择模式 → CSS 变量更新 → 所有组件响应 |
| **错误边界捕获** | 子组件抛错 → ErrorBoundary 捕获 → 降级 UI 展示 |
| **搜索-筛选-列表联动** | 输入关键词 → 列表过滤 → 切换筛选条件 → 列表更新 |
| **审批流程** | 任务创建 → 审批请求弹出 → 用户批准 → 任务状态变更 |

### 4.2 IPC Mock 策略

```typescript
// msw handler mock
import { ipcMain } from 'electron';

// 在测试环境中 mock IPC
const mockIpcHandlers = {
  'workspace:open': jest.fn().mockResolvedValue({ id: 'ws-1', name: 'test' }),
  'config:get': jest.fn().mockResolvedValue({ theme: 'scheme-1-light' }),
  'index:getStatus': jest.fn().mockResolvedValue({ phase: 'ready' }),
};

beforeEach(() => {
  // 注入 mock handlers
  window.electronAPI = {
    invoke: (channel: string, ...args: any[]) => {
      return mockIpcHandlers[channel](...args);
    }
  };
});
```

## 5. E2E 测试（精简）

Phase 0 仅需少量 E2E 测试覆盖核心路径：

| # | 测试场景 | 步骤 |
|---|----------|------|
| 1 | 应用启动 → 欢迎页 | 启动应用 → 验证欢迎页元素存在 |
| 2 | 打开工作区 → Dashboard | 点击打开 → 选目录 → 确认 → 验证 Dashboard |
| 3 | 主题切换 | 设置页 → 选配色 → 选模式 → 验证全局变色 |
| 4 | 索引构建完成 | 新工作区 → 自动索引 → 等待 ready → 验证状态卡片 |
| 5 | 错误恢复 | 模拟崩溃 → 重启 → 验证恢复提示出现 |

## 6. 测试 CI/CD 集成

### 6.1 测试流水线

```
PR 提交
  ↓
┌─────────────────────┐
│  Lint & TypeCheck   │ ← 必须通过
│  (eslint + tsc)     │
└────────┬────────────┘
         │ 通过
         ▼
┌─────────────────────┐
│  Unit Tests         │ ← 覆盖率 ≥ 80%
│  (vitest)           │
└────────┬────────────┘
         │ 通过
         ▼
┌─────────────────────┐
│  Visual Regression   │ ← 截图对比
│  (playwright)       │
└────────┬────────────┘
         │ 通过
         ▼
┌─────────────────────┐
│  Integration Tests  │ ← 关键流程
│  (vitest + msw)     │
└────────┬────────────┘
         │ 通过
         ▼
     ✅ PR 可合并
```

### 6.2 覆盖率目标

| 类型 | 目标覆盖率 |
|------|-----------|
| 语句覆盖率 (Statements) | ≥ 80% |
| 分支覆盖率 (Branches) | ≥ 75% |
| 函数覆盖率 (Functions) | ≥ 85% |
| 行覆盖率 (Lines) | ≥ 80% |
| A11y 属性覆盖率 | **100%**（所有交互元素必须有 ARIA） |

### 6.3 质量门禁

| 条件 | 行为 |
|------|------|
| Unit 测试失败 | 阻止合并 |
| 覆盖率下降 | 阻止合并（低于阈值） |
| 视觉回归失败 | 阻止合并（人工确认后可放行） |
| Lint 错误 | 阻止合并 |
| TypeScript 编译错误 | 阻止合并 |
| A11y axe 扫描 Critical | 阻止合并 |

## 7. 测试文件组织

```
__tests__/
├── unit/
│   ├── components/
│   │   ├── Button.test.tsx
│   │   ├── Input.test.tsx
│   │   ├── Card.test.tsx
│   │   ├── Badge.test.tsx
│   │   ├── ModalDialog.test.tsx
│   │   ├── Tooltip.test.tsx
│   │   └── ...
│   ├── hooks/
│   │   └── useTheme.test.ts
│   └── utils/
│       └── cn.test.ts
├── integration/
│   ├── form-submission.test.tsx
│   ├── modal-flow.test.tsx
│   ├── theme-switching.test.tsx
│   └── error-boundary.test.tsx
├── e2e/
│   ├── app-startup.spec.ts
│   ├── workspace-open.spec.ts
│   └── theme-switch.spec.ts
└── visual/
    ├── __snapshots__/
    │   ├── button-primary-light.png
    │   ├── button-primary-dark.png
    │   ├── button-scheme-2-light.png
    │   └── ...
    └── visual.config.ts
```
