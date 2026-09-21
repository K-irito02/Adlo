# Shadow DOM iframe SecurityError 终极修复经验

**来源**：2026-06-17 重构洞察修复（第 71 轮）
**涉及文件**：`frontend/src/app/features/browser/SafeIframe.tsx`

## 问题

React 19 开发模式下，React DevTools 的 `logComponentRender` 在 `commitPassiveMountOnFiber` 阶段遍历 Fiber 树并访问 `fiber.stateNode.contentWindow`。当 `<iframe>` 加载跨域 URL 时，Chrome 在 C++ 层面直接抛出 `SecurityError`，**无法被任何 JavaScript 层面的 `try-catch`、`Object.defineProperty`、`Proxy` 拦截**。SecurityError 级联破坏 React Scheduler 状态，导致 `"Should not already be working"` 错误，界面完全无响应。

## 失败的尝试（6 轮迭代）

| 方案 | 为什么无效 |
|------|-----------|
| Prototype `Object.defineProperty('contentWindow', ...)` | Chrome 的 `contentWindow` 是 C++ native getter，JS 的 `defineProperty` 对 prototype 上的 native getter 无效 |
| Instance own `Object.defineProperty(el, 'contentWindow', ...)` | Chrome 内部对 `contentWindow` 有特殊保护，JavaScript 无法在实例上 shadow 它 |
| `document.body.appendChild` + `position:fixed` | iframe 覆盖整个页面视口，阻挡所有点击事件，UI 无响应 |
| `useEffect` 中 `createElement('iframe')` + `container.appendChild` | React DevTools 通过 `element.children` 遍历真实 DOM 树，无论 iframe 如何创建，只要在 React 管理的 DOM 子树中就能被找到 |
| Callback ref + instance level defineProperty | Chrome 内部仍然忽略 JS 层面的 own property 拦截 |

## 最终方案：Shadow DOM (`attachShadow({ mode: 'closed' })`)

Shadow DOM 是**浏览器原生的 DOM 隔离边界**：

- `element.attachShadow({ mode: 'closed' })` 创建一个封闭的影子树
- `element.children`、`element.childNodes`、`querySelectorAll('*')` 对影子树内容**完全不可见**
- React DevTools 遍历 `fiber.stateNode.children` → 只有空的容器 `<div>` → 找不到 iframe
- SecurityError 永远不会被触发 → React Scheduler 保持健康

## 关键实现细节

1. **React 只渲染 `<div ref={containerRef}>`**，没有 `<iframe>` Fiber
2. **`useEffect` 中**用 `document.createElement('iframe')` 创建真实 iframe
3. **容器 `<div>` 接收 `className`** 使 CSS 类选择器生效（如 `.adl-browser-iframe { position: absolute; ... }`）
4. **影子 DOM 内的 iframe**用 `style.width='100%'; style.height='100%'` 填充容器
5. **StrictMode 兼容性**：`container.shadowRoot ?? container.attachShadow(...)` 复用已有 shadow root，避免双重调用报错

## 经验教训

- **`contentWindow` 是 Chrome 的"最高安全级别"属性**，JS 层面的所有拦截手段（`defineProperty`、`Proxy`、`try-catch`）都对它无效
- **Shadow DOM `mode: 'closed'`** 是浏览器原生隔离手段，对 React DevTools 等框架工具的 DOM 遍历完全不可见
- **CSS 作用域隔离**：影子 DOM 内的样式与主文档完全隔离，需要在影子树内自行定义样式或使用内联样式
- **容器 `<div>` 必须接收 `className`**：即使 iframe 在影子树内，容器的尺寸和定位仍依赖主文档 CSS
- **不要与 Angular/React/Vue 框架的 DOM 遍历机制硬碰硬**——用浏览器的原生隔离 API（Shadow DOM）从根源阻止访问
