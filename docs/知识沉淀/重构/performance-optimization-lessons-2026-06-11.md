# 性能优化经验总结（2026-06-11）

## 核心议题

本轮完成了重构洞察修复计划的 11 个任务，覆盖从文件树虚拟化到 React.lazy 延迟加载的全链路性能优化。以下是关键经验教训。

---

## 1. Zustand 选择器优化

### 问题识别
- `useAppStore()` 全量订阅 = 任何 state 变化都触发组件重渲染
- 对象选择器未使用 `useShallow` = 每次渲染创建新对象 = 无限循环或过度渲染

### 修复成本
- 约 40+ 个组件需要修改
- 单文件修改平均 15 分钟
- 验证方式：`pnpm run typecheck` + `pnpm test`

### 经验教训
1. **引入阶段就强制执行**：新组件从第一天就使用选择器模式，后续修复成本高
2. **使用 lint 规则防范**：可以用 ESLint rule 禁止 `useAppStore()` 无参调用（目前项目无自定义 rule，依赖 code review）
3. **选择器粒度平衡**：每个组件的选择器不宜超过 10 个字段，否则应考虑拆分 hook

### 反模式清单（每次 PR 必查）
- ❌ `const state = useAppStore();`
- ❌ 对象选择器缺少 `useShallow` 包装
- ❌ 闭包内使用响应式值而不是 `getState()`
- ✅ `const field = useAppStore((s) => s.someField);`
- ✅ `useShallow` 包裹多字段选择

---

## 2. React.memo 与列表项

### 适用场景
- 固定高度的列表行组件（虚拟化或常规列表）
- 父组件频繁刷新但子项 props 稳定
- 列表项数量 ≥ 50

### 常见陷阱
1. **props 中包含内联对象/函数**：`React.memo` 失效，因为每次渲染都是新引用
2. **key 使用数组索引**：数据重新排序后，React 无法正确复用
3. **过度 memo**：简单组件（<10 行 JSX）不需要 memo，shallowEqual 比较开销更大

### 正确模式
```tsx
export const TreeNodeRow = React.memo(function TreeNodeRow(props: Props) {
  const onToggle = useCallback(() => props.onToggle(props.node.path), [props.onToggle, props.node.path]);
  return <li onClick={onToggle}>...</li>;
});
```

---

## 3. 虚拟列表实现

### 设计决策
- **自建 `useVirtualList`** 而不是使用 `react-window`：减少第三方依赖，与项目状态管理集成更紧密
- **固定高度**：28px 行高，不支持动态高度（简化实现，避免尺寸测量开销）
- **`requestAnimationFrame` 节流**：滚动事件不直接更新 state，排队到下一帧

### 测试环境降级策略
问题：`renderToStaticMarkup` 或 JSDOM 中 `clientHeight` 为 0，导致计算可见范围为空数组。
解决：`viewportHeight === 0` 时降级为全量渲染。

```ts
if (viewportHeight === 0) {
  return { startIndex: 0, endIndex: items.length, offsetY: 0 };
}
```

### 可扩展性
- 如需动态高度：改用 `ResizeObserver` 测量每行高度 + 维护 offset map
- 如需水平虚拟化：扩展 hook 参数 `{ horizontal?: boolean }`

---

## 4. React.lazy 代码分割

### 分割原则
- **重型第三方库**：CodeMirror（~500KB）、xterm.js（~200KB）
- **非首屏组件**：DiffViewer、设置面板、预览组件
- **不分割首屏关键组件**：Composer、MessageBubble、Sidebar

### Suspense fallback 设计
- 使用骨架屏或轻量占位，避免布局跳动
- fallback 尺寸与真实组件一致，保证 CLS（Cumulative Layout Shift）最小

### 陷阱
- `React.lazy` 仅支持 default export，命名导出需包装
- SSR 环境下 `React.lazy` 需要特殊处理（本项目非 SSR，无需担心）

---

## 5. 桥接层一致性维护

### 三端同步的痛点
- 新增一个 IPC 方法 = 修改 4 个文件（interface + 3 个实现）
- 易遗漏：Mock bridge 和 Preview bridge 经常落后于 Tauri bridge
- 参数类型漂移：内联类型定义 vs 命名类型

### 解决方案
1. **命名类型优先**：所有 IPC 参数使用 `interface` / `type`，禁止内联对象字面量
2. **类型检查作为门禁**：`pnpm run typecheck` 捕获接口不一致
3. **文档注释同步**：接口定义处的 JSDoc 作为唯一真源，实现文件参考接口注释

---

## 6. 内存泄漏防御

### 常见泄漏点
1. **`setTimeout` 未清理**：组件卸载前需 `clearTimeout`
2. **`addEventListener` 未移除**：特别是 `window` / `document` 上的监听
3. **`ResizeObserver` / `MutationObserver` 未 disconnect**
4. **Promise 链引用组件已卸载的 state setter**

### 防御模式
```tsx
const timerRef = useRef<number | null>(null);

useEffect(() => {
  timerRef.current = window.setTimeout(() => { ... }, 1000);
  return () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, []);
```

### 调试工具
- React DevTools Profiler：检测重渲染频率
- Chrome Memory 面板：heap snapshot 对比
- 页面右上角调试日志：查看 warning / error 输出

---

## 7. 质量门禁的价值

### 门禁清单
| 检查 | 作用 | 执行时间 |
|------|------|---------|
| `pnpm run typecheck` | 类型一致性 | ~30s |
| `pnpm test` | 运行时行为正确性 | ~20s |
| `cargo fmt --check` | Rust 格式一致性 | <5s |
| `cargo clippy` | Rust lint 检查 | ~30s |
| `cargo test` | Rust 单元/集成测试 | ~10s |

### 经验
- **越早运行越好**：修改单个文件后立即运行相关测试，比最后全量运行更容易定位问题
- **不要信任人工检查**：`adl-pty` 的 Windows 测试在 CI 环境可用但本地失败，说明环境依赖不可忽视
- **测试不是重构的障碍**：只要测试设计合理（不依赖内部实现细节），测试是重构的安全网

---

## 8. 执行经验

### 大型重构的执行策略
1. **从最独立的模块开始**：如 `useVirtualList` hook，不影响其他代码
2. **每个子任务都要能单独验证**：修改后立即跑 typecheck + test，确认不破坏
3. **保持小步提交**：每个 PR 专注一个主题，review 和回滚都更容易
4. **文档更新与代码同步**：代码变更的同一轮中更新规则文档，避免知识断层

### 常见陷阱
- **过度优化**：没有性能数据支撑的优化是浪费时间。先测量，再优化
- **一次性大改**：难以调试、难以 review、难以回滚
- **忘记更新测试**：测试与代码漂移 = 测试失去价值

---

## 下一步建议

1. **引入 React DevTools 性能追踪**：记录首屏加载时间和关键交互响应时间
2. **Bundle 分析**：使用 `rollup-plugin-visualizer` 或 `source-map-explorer` 分析代码分割效果
3. **自定义 ESLint rule**：禁止 `useAppStore()` 无参调用，强制执行选择器模式
4. **性能基准测试**：建立文件树渲染的基准测试，监控回归
