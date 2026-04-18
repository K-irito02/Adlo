# 交互反馈规范 (Interaction Feedback)

> 完善各类交互操作的视觉、触觉和状态反馈机制

## 1. 反馈原则

| 原则 | 说明 |
|------|------|
| **即时性** | 用户操作后 100ms 内必须有视觉变化 |
| **明确性** | 反馈必须清晰传达操作结果（成功/失败/进行中） |
| **一致性** | 同类操作的反馈方式全局一致 |
| **非阻塞** | 反馈不应阻碍用户后续操作（Toast vs Modal 的选择） |
| **可撤销** | 破坏性操作应提供撤销入口 |

## 2. 操作类型与反馈映射

### 2.1 即时反馈 (< 200ms)

| 操作 | 视觉反馈 | 触觉/音频 |
|------|----------|-----------|
| 按钮点击 | 按压态 (scale 0.97 + shadow-inner) | - |
| 链接 Hover | 颜色加深 + 下划线出现 | - |
| 输入框 Focus | 边框变色 + Focus Ring 发光 | - |
| 开关 Toggle | 滑块滑动动画 | - |
| Checkbox 勾选 | 勾选动画 (scale 弹跳) | - |
| Tab 切换 | 下划线滑移动画 | 可选: 轻微点击音 |
| Tooltip 出现 | Fade + Scale 动画 | - |

### 2.2 短延迟反馈 (200ms ~ 1s)

| 操作 | 视觉反馈 | 位置 |
|------|----------|------|
| 表单提交 | 按钮 → Loading Spinner → 成功/错误图标 | 按钮内 |
| 文件复制 | 图标 → ✓ Check 动画 | 图标位置或 Toast |
| 删除确认 | 对话框弹出 | 屏幕中央 |
| 下拉选择展开 | 菜单从 trigger 向下滑入 | Trigger 下方 |
| 侧边栏折叠 | 宽度动画过渡 | 左侧 |

### 2.3 异步反馈 (> 1s)

| 操作 | 视觉反馈 | 说明 |
|------|----------|------|
| 数据加载 | Skeleton 占位屏脉冲 | 替代内容区域 |
| 索引构建 | 进度条 + 百分比文字 | 页面顶部或卡片内 |
| 文件导出 | 进度条 + "正在导出..." | 内联或 Toast |
| 大量数据保存 | 全屏 Overlay + Progress Ring | 阻断式（防止误操作） |
| API 请求失败 | 错误 Toast / Alert Banner | 页面顶部 |

### 2.4 结果通知

| 结果类型 | 组件 | 自动消失时间 | 可手动关闭 |
|----------|------|--------------|------------|
| ✅ 成功 | Toast (Success) | 3s | ✅ |
| ℹ️ 信息 | Toast (Info) | 4s | ✅ |
| ⚠️ 警告 | Toast (Warning) | 5s | ✅ |
| ❌ 错误 | Toast (Error) | 不自动消失 | ✅ 必须手动 |
| 🔒 高危操作结果 | Toast (Danger) | 不自动消失 | ✅ 必须手动 |

## 3. 各组件的完整状态反馈

### 3.1 Button 状态机

```
                    ┌─────────────┐
                    │   Default   │
                    │  (可交互)    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  Hover   │  │  Focus   │  │ Disabled │
        │ (鼠标悬停)│  │(键盘聚焦) │  │  (禁用)  │
        └─────┬────┘  └─────┬────┘  └──────────┘
              │             │
              ▼             ▼
        ┌──────────┐  ┌──────────┐
        │ Active   │  │  Pressed │
        │ (按下中)  │  │ (按住)   │
        └─────┬────┘  └─────┬────┘
              │             │
              ▼             ▼
        ┌──────────────────────┐
        │      Loading         │
        │  (Spinner 替换图标)   │
        │  (禁止重复点击)       │
        └──────────┬───────────┘
                   │
                   ▼
           ┌───────────────┐
           │  Success/Error │
           │  (结果反馈)    │
           └───────────────┘
```

#### 各状态的视觉规格

| 状态 | 背景 | 文字/图标 | 边框 | Shadow | Cursor |
|------|------|-----------|------|--------|--------|
| Default | `--color-secondary` 或 `--color-bg-brand` | `--color-text-inverse` 或 `--color-primary` | `--color-border-default` | `shadow-none` or `shadow-sm` | pointer |
| Hover | 10% 加深 | 不变 | `--color-border-strong` | `shadow-default` | pointer |
| Focus | 不变 | 不变 | `--color-border-strong` + ring | focus-ring | pointer |
| Active/Pressed | 15% 加深 | 微下移 (translateY 1px)) | 不变 | `shadow-inner` | pointer |
| Disabled | `--color-bg-inset` | `--color-text-muted`, opacity 0.5 | `--color-border-subtle` | none | not-allowed |
| Loading | 同 Default | Spinner (currentColor) | 不变 | 不变 | wait |

### 3.2 Input 状态反馈

| 状态 | 边框颜色 | 背景色 | Focus Ring | 辅助元素 |
|------|----------|--------|-----------|----------|
| Default | `border-default` | `bg-elevated` | 无 | placeholder 文字 |
| Filled | `border-default` | `bg-elevated` | 无 | 清除按钮出现 |
| Hover | `border-strong` | 不变 | 无 | - |
| Focus | `border-strong` | 不变 | 外发光 ring | 光标定位到末尾 |
| Error | `danger` 色 | `bg-danger` (极淡) | danger 色环 | ✕ 图标 + 错误消息 |
| Success | `success` 色 | `bg-success` (极淡) | success 色环 | ✓ 图标 |
| Disabled | `border-subtle` | `bg-inset` | 无 | 文字变为 muted |

### 3.3 Card 状态反馈

| 状态 | Shadow | Border | Transform | 说明 |
|------|--------|--------|-----------|------|
| Default | `shadow-sm` 或 none | `border-default` | none | 静态展示 |
| Hover | `shadow-md` | `border-default` | translateY(-2px) | 提示可交互 |
| Selected | `shadow-default` | `border-primary` (2px) | none | 选中/激活态 |
| Dragging | `shadow-xl` | `border-primary` | scale(1.02) + rotate(1°) | 拖拽中 |
| Disabled | none | `border-subtle` | none | opacity 0.5 |

## 4. 特殊场景反馈

### 4.1 危险操作二次确认

```
用户点击 [删除] 按钮
  ↓ (即时反馈)
按钮变 Danger 态 (红色)
  ↓
弹出 ConfirmDialog (二级确认)
  ├─ Level 1 (Warning): Checkbox "我理解此操作不可撤销"
  ├─ Level 2 (Danger): 手动输入 "DELETE" 确认
  └─ Level 3 (Critical): 输入确认 + 5 秒冷却倒计时
  ↓
用户确认 → 执行操作
  ↓
结果反馈:
  ├─ 成功 → Toast "已删除" + [撤销] 选项 (15s 内)
  └─ 失败 → Error Dialog 显示详情
```

### 4.2 骨架屏加载序列

```
内容请求发出
  ↓ (~100ms)
当前内容保持显示（不立即清空）
  ↓ (~300ms)
如果仍未返回，显示 Skeleton 脉冲占位
  ↓
数据返回 → 内容淡入替换 Skeleton
  ↓
Skeleton 元素使用 fade-out (150ms) 过渡
```

### 4.3 撤销操作

| 操作类型 | 撤销窗口 | 撤销方式 |
|----------|----------|----------|
| 删除文件 | 15 秒 | Toast 中 [撤销] 按钮 |
| 批量删除 | 30 秒 | Toast 中 [撤销全部] 按钮 |
| 配置修改 | 直到离开页面 | [重置为默认] 按钮 |
| 工作区关闭 | 不提供撤销 | 二次确认对话框 |

### 4.4 空状态引导

```
空状态出现条件:
  ↓
┌────────────────────────────────┐
│          📭 (插图)              │
│                                │
│     "暂无任务"                  │
│                                │
│   任务将在 AI 操作执行时自动创建 │
│                                │
│   [创建第一个任务] (Primary)    │
│                                │
└────────────────────────────────┘

引导规则:
- 插图风格统一（SVG，使用当前主题色）
- 标题清晰说明"没有什么"
- 描述文字给出建议或原因
- 主要操作按钮指向下一步
- 次要操作链接可选（如"了解详情"）
```

## 5. 反馈时序编排示例

### 示例: 用户提交审批决定

```
T+0ms     用户点击 [批准] 按钮
          ↓ 按钮立即变为 pressed 态 (scale 0.97)
          
T+0ms     按钮变为 loading 态
          ↓ Spinner 替换按钮文字
          ↓ 按钮禁用重复点击
          
T+800ms   IPC 返回成功
          ↓ Spinner 变为 ✓ Check 图标
          ↓ 按钮背景变为 success 色
          
T+900ms   Toast 从右上角滑入
          ↓ "已批准该操作"
          ↓ 包含 [撤销] 按钮 (15s 有效)
          
T+5000ms  Toast 开始淡出 (opacity → 0)
          
T+5500ms  Toast 完全消失
          ↓ 任务列表中的状态 Badge 更新
          ↓ 新状态使用 fade-in 动画 (200ms)
```
