# RefreshButton 动画模式

## 场景

Git 可视化区域的刷新按钮：点击触发旋转动画，数据加载完成后停止。

## 方案

使用 `motion/react` 的 `useAnimation` 实现精确的`点击触发 → 加载完成停止`控制，而非 CSS `@keyframes`。

```tsx
const controls = useAnimation();
const [isRefreshing, setIsRefreshing] = useState(false);

const handleClick = useCallback(async () => {
  if (isRefreshing) return;
  setIsRefreshing(true);
  controls.start('animate');   // 启动无限旋转
  try {
    await onRefresh();          // 等待异步操作
  } finally {
    controls.start('normal');   // 停止旋转，spring 缓动回正
    setIsRefreshing(false);
  }
}, [onRefresh, isRefreshing, controls]);
```

## motion.path 配置

- **animate 变体**: `rotate: 360` + `repeat: Infinity`, `duration: 0.8s`, `ease: linear`
- **normal 回正过渡**: `type: 'spring'`, `stiffness: 50`, `damping: 10`
- **transformOrigin**: `"12px 12px"`（SVG viewBox 中心点）

## 与 CSS 动画对比

| 维度 | CSS @keyframes | motion useAnimation |
|------|---------------|-------------------|
| 启动时机 | class 切换 | 方法调用（`controls.start()`） |
| 停止时机 | class 移除 | 方法调用（`controls.start('normal')`） |
| 停止缓动 | 无（突然停止） | spring 缓动减速 |
| 卸载安全 | 自动 | 需 `isMountedRef` 防护 |

## 组件结构

`RefreshButton` 是共享组件（`features/git-visualization/RefreshButton.tsx`），接收三个 prop：

- `onRefresh: () => Promise<void>` — 异步刷新回调
- `label: string` — 同时用于 `aria-label` 和 `title`（系统原生 tooltip）
- `className?: string` — 可选附加 class（如 `--lg` 大尺寸变体）

## 卸载防护

因 `await onRefresh()` 期间组件可能卸载，使用 `isMountedRef` 保护：

```tsx
const isMountedRef = useRef(true);
useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

// 在 finally 中：
if (isMountedRef.current) {
  controls.start('normal');
  setIsRefreshing(false);
}
```

## 适用场景

任何需要"点击触发动画 → 异步操作完成后停止"的交互场景，如刷新、加载、同步等操作按钮。
