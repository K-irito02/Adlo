# 无障碍设计规范 (Accessibility / A11y)

> 确保键盘导航、屏幕阅读器兼容性、颜色对比度等无障碍要求

## 1. 核心原则

| 原则 | WCAG 级别 | 说明 |
|------|-----------|------|
| **可感知** | A / AA | 信息必须以用户可感知的方式呈现 |
| **可操作** | A / AA | 所有功能可通过键盘访问 |
| **可理解** | AA | UI 和信息必须清晰易懂 |
| **健壮性** | A | 兼容主流辅助技术（屏幕阅读器） |

**目标等级: WCAG 2.1 AA**（关键功能达到 AAA）

## 2. 键盘导航

### 2.1 Tab 序列规则

| 规则 | 说明 |
|------|------|
| **顺序一致** | Tab 顺序必须与视觉阅读顺序一致（从左到右、从上到下） |
| **无跳过** | 不允许跳过可交互元素（除非使用 `tabindex="-1"` 有意为之） |
| **焦点可见** | 键盘聚焦时必须有可见的 Focus Ring（2~4px outline） |
| **焦点陷阱** | Modal/Dialog 内 Tab 必须循环，不能逃逸到背景内容 |
| **Escape 关闭** | 所有弹窗、下拉菜单、模态框必须支持 Escape 关闭 |

### 2.2 标准键盘交互

| 元素 | 触发键 | 行为 |
|------|--------|------|
| 按钮 / 链接 | Enter / Space | 激活点击 |
| Checkbox | Space | 切换选中状态 |
| Radio 组 | 方向键 | 在选项间移动 + Space 选择 |
| Select / Dropdown | Enter / Space / ↓ | 打开选项列表 |
| 下拉选项 | ↑↓ | 上下移动选择 |
| Escape | Escape | 取消/关闭当前弹出层 |
| Tab | Tab | 移到下一个可聚焦元素 |
| Shift+Tab | Shift+Tab | 移到上一个可聚焦元素 |
| Modal 内 | Tab | 在 Modal 内循环（首尾循环） |
| 搜索框 | 输入时即时搜索 | 实时过滤 |

### 2.3 Focus Ring 规格

```css
/* 默认 Focus Ring */
:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* 去除浏览器默认 outline */
:focus:not(:focus-visible) {
  outline: none;
}

/* 特殊组件的 Focus Ring */
/* Button */
button:focus-visible {
  box-shadow: 0 0 0 2px var(--color-bg-base), 
              0 0 0 4px var(--color-focus-ring);
}

/* Input */
input:focus-visible {
  border-color: var(--color-border-strong);
  box-shadow: 0 0 0 3px rgba(var(--color-focus-ring-rgb), 0.15);
}
```

### 2.4 Skip Link

```html
<!-- 页面首行，键盘用户可跳过重复导航 -->
<a href="#main-content" class="skip-link">跳转到主要内容</a>
```

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--color-primary);
  color: var(--color-text-inverse);
  padding: var(--space-2) var(--space-4);
  z-index: var(--z-tooltip);
  transition: top 150ms ease-out;
}

.skip-link:focus {
  top: 0;
}
```

## 3. 屏幕阅读器支持

### 3.1 语义化 HTML

| 元素 | 正确用法 | 避免 |
|------|----------|------|
| 按钮 | `<button>` 或 `role="button"` + tabindex | `<div onclick>` |
| 链接 | `<a href>` | `<div onclick>` 跳转 |
| 表单 | `<label for>` + `<input>` | 仅用 placeholder |
| 列表 | `<ul>/<ol>` + `<li>` | `<div>` 堆叠模拟 |
| 对话框 | `<dialog>` 或 `role="dialog"` + `aria-modal` | `<div>` 绝对定位 |
| 导航 | `<nav>` + `<ul>` | 纯 div 布局 |
| 主内容 | `<main id="main-content">` | 缺少 landmark |
| 补充信息 | `<aside>` / `<section>` | 全部 `<div>` |

### 3.2 ARIA 属性速查

| 场景 | 必需属性 | 示例 |
|------|----------|------|
| 图标按钮（无文字） | `aria-label` | `<button aria-label="关闭"><Icon name="x" /></button>` |
| 加载状态 | `aria-busy="true"` | `<div role="status" aria-busy="true">加载中...</div>` |
| 错误消息关联 | `aria-describedby` → error ID | `<input aria-describedby="email-error">` |
| 展开/折叠 | `aria-expanded` | `<button aria-expanded="false">详情</button>` |
| 选中状态 | `aria-selected` / `aria-checked` | Tab 项 / Checkbox |
| 当前项 | `aria-current="page"` | 当前导航项 |
| 弹出菜单 | `aria-haspopup="true"` | 下拉触发按钮 |
| 进度条 | `aria-valuenow / aria-valuemin / aria-valuemax` | `<progress>` 或自定义 |
| 实时区域 | `aria-live="polite"` / `"assertive"` | Toast / 错误提示 |
| 装饰内容 | `aria-hidden="true"` | 纯装饰图标/分隔线 |

### 3.3 动态内容通知

```html
<!-- Toast 通知 - 必须让屏幕阅读器感知 -->
<div role="status" aria-live="polite" class="toast">
  工作区配置已保存
</div>

<!-- 错误提示 - 使用 assertive 立即打断 -->
<div role="alert" aria-live="assertive" class="error-toast">
  连接失败，请检查网络设置
</div>

<!-- 内容变化但不重要 - 用 polite -->
<div aria-live="polite" class="char-count">
  已输入 23 / 500 字
</div>
```

### 3.4 图片与图标

| 类型 | 要求 |
|------|------|
| 有意义的图片 | `<img alt="描述性替代文字">` |
| 装饰性图片 | `<img alt="" aria-hidden="true">` |
| SVG 图标（装饰） | `aria-hidden="true"` |
| SVG 图标（独立按钮） | 包含在 `<button aria-label="...">` 内 |
| SVG 图标（有文字的按钮） | SVG 设为 `aria-hidden="true"`，文字本身提供标签 |

## 4. 颜色与对比度

### 4.1 WCAG 对比度要求

| 文字类型 | AA 标准 | AAA 标准 |
|----------|---------|----------|
| 正文 (< 18pt) | ≥ **4.5:1** | ≥ **7:1** |
| 大号文字 (≥ 18pt 或 ≥ 14pt bold) | ≥ **3:1** | ≥ **4.5:1** |
| UI 组件（边框、形状） | ≥ **3:1** | - |

### 4.2 颜色非唯一信息传达

**禁止**: 仅用颜色表达信息。

**正确做法**: 颜色 + 图标/文字/图案 同时传达：

| 场景 | ❌ 仅颜色 | ✅ 颜色 + 其他 |
|------|-----------|---------------|
| 表单错误 | 红色边框 | 红色边框 + 红色错误图标 + 错误文字 |
| 成功状态 | 绿色勾 | 绿色勾 + "已保存" 文字 |
| 警告 | 黄色背景 | 黄色背景 + ⚠️ 图标 + "注意" 文字 |
| 数据图表 | 不同颜色的柱状图 | 柱状图 + 图案填充(条纹/点阵) + 数据标签 |
| 链接 | 蓝色文字 | 蓝色文字 + 下划线(hover 时显示) |
| 必填字段 | 红色星号 * | 红色星号 + "必填" 文字(label 中) |

### 5 种配色方案对比度已在各配色文档中验证通过。

## 5. 运动与闪烁安全

| 规则 | 说明 |
|------|------|
| **无自动闪烁** | 不允许任何 > 3次/秒 的闪烁内容 |
| **Reduced Motion** | 尊重 `prefers-reduced-motion: reduce` 系统设置 |
| **动画时长限制** | 自动播放动画 ≤ 5 秒，或提供暂停方式 |
| **无干扰模式** | 提供关闭所有动画的全局开关（开发者设置中） |

## 6. 表单无障碍

### 6.1 Label 关联

```html
<!-- 正确: label + for/id 关联 -->
<label for="workspace-path">工作区路径</label>
<input type="text" id="workspace-path" />

<!-- 正确: 包裹式 label -->
<label>
  工作区名称
  <input type="text" />
</label>

<!-- 正确: aria-label（当不可见 label 时） -->
<input type="text" aria-label="搜索文件" placeholder="搜索..." />

<!-- 错误: 仅用 placeholder（ insufficient） -->
<input type="text" placeholder="请输入..." /> 
```

### 6.2 错误反馈

```html
<div class="form-field">
  <label for="email" id="email-label">邮箱地址</label>
  <input 
    type="email" 
    id="email"
    aria-labelledby="email-label"
    aria-describedby="email-error email-hint"
    aria-invalid="true"
  />
  <p id="email-hint" class="hint">用于接收通知</p>
  <p id="email-error" role="alert" class="error">
    请输入有效的邮箱地址
  </p>
</div>
```

### 6.3 必填指示

```html
<!-- 推荐: 文字说明 + 视觉提示 -->
<label>
  用户名 <span class="required">(必填)</span>
</label>

<!-- 也接受: aria-required -->
<input aria-required="true" />

<!-- 避免: 仅红色星号且无文字解释 -->
<label>用户名 *</label> <!-- ⚠️ 屏幕阅读器可能读作 "用户名 星号" -->
```

## 7. 无障碍测试检查清单

### 开发阶段自查

- [ ] 所有可点击元素均可通过 Tab 到达
- [ ] 所有按钮均有 `aria-label` 或可见文字标签
- [ ] Focus Ring 在所有主题下均清晰可见
- [ ] Modal 打开时焦点被正确 trap
- [ ] Escape 可关闭所有弹出层
- [ ] 图片和装饰图标有正确的 `alt` / `aria-hidden`
- [ ] 颜色不是唯一的信息传达方式
- [ ] 表单字段都有 `<label>` 关联
- [ ] 错误消息通过 `role="alert"` 通知屏幕阅读器
- [ ] `prefers-reduced-motion` 下动画被禁用或降级

### 测试工具推荐

| 工具 | 用途 |
|------|------|
| **键盘-only 测试** | 断开鼠标，仅用键盘完成所有操作 |
| **NVDA / JAWS / VoiceOver** | 使用真实屏幕阅读器测试完整流程 |
| **Lighthouse Accessibility Audit** | Chrome DevTools 自动化检测 |
| **axe DevTools** | 浏览器扩展，实时 A11y 问题扫描 |
| **WAVE** | Web Accessibility Evaluation Tool |
| **Color Contrast Analyzer** | 验证所有配色方案的对比度 |
