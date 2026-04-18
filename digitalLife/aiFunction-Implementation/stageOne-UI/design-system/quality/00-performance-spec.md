# 性能优化策略 (Performance)

> 确保 UI 渲染性能和加载速度，保持桌面应用流畅体验

## 1. 性能目标

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| 首次内容绘制 (FCP) | < 800ms | DevTools Performance |
| 最大内容绘制 (LCP) | < 1200ms | DevTools Performance |
| 首次输入延迟 (FID) | < 50ms | Lighthouse |
| 布局偏移 (CLS) | < 0.05 | Lighthouse |
| 交互响应时间 (INP) | < 100ms | Lighthouse |
| 页面切换动画帧率 | ≥ 60fps | DevTools Performance / FPS Meter |
| 大列表滚动帧率 | ≥ 60fps | 虚拟滚动实现后验证 |
| 内存占用（稳定态） | < 200MB RSS | Task Manager / process.memoryUsage() |
| Worker 进程内存 | < 100MB RSS | 同上 |

## 2. 渲染性能优化

### 2.1 GPU 加速动画

**原则**: 仅对 `transform` 和 `opacity` 做动画，避免触发 Layout / Paint。

```css
/* ✅ 好: GPU 合成层动画 */
.animated-element {
  will-change: transform, opacity;
  transform: translateX(0);
  opacity: 1;
}

/* ❌ 差: 触发 Layout 的属性 */
.bad-animation {
  width: 200px;        /* ← 改变尺寸触发 reflow */
  top: 10px;           /* ← 改变位置触发 reflow */
  margin-left: 20px;   /* ← 触发 cascading layout */
}
```

### 2.2 CSS Containment

为独立区域声明 containment，限制浏览器重排范围：

```css
/* 卡片组件 - 内部变化不影响外部 */
.card {
  contain: content layout style;
}

/* 列表项 - 独立渲染 */
.list-item {
  contain: strict; /* 最强隔离 */
}
```

### 2.3 减少重绘策略

| 策略 | 说明 |
|------|------|
| **Batch DOM writes** | 将多次 DOM 写入合并到单次 requestAnimationFrame |
| **Virtual Scrolling** | 长列表 (> 50 项) 使用虚拟滚动，仅渲染可视区 + buffer |
| **CSS `will-change`** | 对频繁动画元素提前提示浏览器创建合成层 |
| **避免同步布局读取** | 不在写入后立即读取 offsetWidth/Height 等 |
| **Debounce resize/scroll** | 窗口 resize 和 scroll 事件使用 debounce |

### 2.4 图标与字体优化

| 优化项 | 策略 |
|--------|------|
| SVG 图标 | 按需加载（tree-shaking），不使用的图标不打包 |
| 字体加载 | `font-display: swap` 避免 FOIT；预加载关键字体 |
| Icon Font | **禁止使用**，全部使用内联 SVG 或 SVG Sprite |
| SVG 文件大小 | 单个图标 < 2KB（压缩后）；复杂图标考虑简化路径 |

## 3. 组件级性能优化

### 3.1 React 渲染优化

| 技术 | 适用场景 | 说明 |
|------|----------|------|
| `React.memo()` | 纯展示组件 | Props 未变时跳过重新渲染 |
| `useMemo()` | 计算开销大的派生数据 | 缓存计算结果 |
| `useCallback()` | 传递给子组件的回调 | 保持引用稳定 |
| `React.lazy()` + `Suspense` | 非首屏大型组件 | Modal、设置页等按需加载 |
| 虚拟列表 | 日志列表、任务列表 > 50 项 | `react-window` 或自实现 |
| 列表 Key | 必须使用稳定唯一 ID | 禁止用 index 作为 key |

### 3.2 组件懒加载策略

```
首屏必需（立即加载）:
├── AppShell (Sidebar + Header + Status)
├── Button / Input / Badge (基础组件)
└── WelcomePage / WorkspacePage

路由级懒加载:
├── SettingsPage → React.lazy()
├── LogViewerPage → React.lazy()
├── TaskCenterPage → React.lazy()
└── AboutDialog → React.lazy()

按需加载:
├── RichTextEditor → 动态 import() (Phase 1)
├── Chart Components → 动态 import()
└── HeavyModal → React.lazy()
```

## 4. 数据与状态性能

### 4.1 Zustand Store 优化

| 策略 | 说明 |
|------|------|
| **Slice 分割** | 按功能域拆分 store（theme / workspace / task / log） |
| **选择性订阅** | 组件只订阅需要的 slice，避免全局更新导致全量重渲染 |
| **中间选择器** | 使用 `useStore(selector)` 精确选取所需数据 |
| **避免深层嵌套** | 扁平化 state 结构，减少不可变比较开销 |

### 4.2 IPC 通信优化

| 策略 | 说明 |
|------|------|
| **批量请求** | 多个连续的 get 请求合并为一次批量调用 |
| **缓存结果** | Main 进程缓存不变数据（如工作区信息），避免重复 IPC |
| **防抖高频调用** | 窗口 resize、日志 tail 等高频操作使用 debounce |
| **Web Worker 卸载** | 重计算任务（如索引统计）放到 Worker 进程 |

## 5. 资源加载优化

### 5.1 图片资源

| 规则 | 说明 |
|------|------|
| 格式优先级 | AVIF > WebP > PNG/SVG（位图） |
| 尺寸限制 | UI 插图 < 200KB；空状态插图 < 100KB |
| 懒加载 | 非首屏图片使用 `loading="lazy"` |
| 占位空间 | 所有 `<img>` 设置 width/height 属性防止 CLS |
| SVG 优化 | 使用 SVGO 去除冗余属性和注释 |

### 5.2 CSS 优化

| 策略 | 说明 |
|------|------|
| Critical CSS 内联 | 首屏关键样式内联到 HTML |
| CSS 按需加载 | 非关键样式通过动态 import 分割 |
| 移除未使用 CSS | PurgeCSS / Tailwind JIT 模式自动清理 |
| CSS 变量 vs 编译时 | 主题色变量运行时切换；静态令牌编译时确定 |

### 5.3 Bundle 优化

| 目标 | 策略 |
|------|------|
| 主 Bundle < 200KB (gzip) | Tree-shaking + Code Splitting |
| Vendor Bundle 分离 | react / react-dom 单独 chunk |
| 按路由分割 | 每个页面一个 async chunk |
| Source Map | 开发环境启用，生产环境关闭或隐藏 |

## 6. 运行时监控

### 6.1 Performance Observer API

```typescript
// 监控长任务（阻塞主线程 > 50ms）
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 50) {
      log.warn(`Long Task: ${entry.name} took ${entry.duration.toFixed(0)}ms`);
    }
  }
});
observer.observe({ entryTypes: ['longtask'] });
```

### 6.2 关键指标采集

| 指标 | 采集方式 | 上报条件 |
|------|----------|----------|
| FCP | PerformanceObserver | 每次 SPA 导航 |
| LCP | PerformanceObserver | 每次 SPA 导航 |
| FID | PerformanceObserver (需用户交互) | 用户首次交互 |
| CLS | LayoutShiftObserver | 全程监控 |
| 内存使用 | process.memoryUsage() | 定期（每 30s）+ 异常阈值告警 |
| FPS | requestAnimationFrame 计数器 | 连续监测 |

### 6.3 性能预算告警

| 预算项 | 阈值 | 超标行为 |
|--------|------|----------|
| JS Bundle Size | > 300KB (gzip) | 控制台警告 + 构建失败 |
| 首屏渲染 | > 1500ms | 控制台警告 |
| 内存占用 | > 300MB RSS | Toast 提示 "内存占用过高" |
| 长任务 | > 200ms | 开发模式 console.warn |
| 组件渲染耗时 | > 16ms (一帧) | React DevTools Profiler 标红 |
