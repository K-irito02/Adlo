# StartupOverlay — 启动过渡动画覆盖层

## 问题

应用启动后 UI 元素虽可见并可触发 UI/UX 效果，但实际尚未完全加载成功（bootstrap 未完成），用户在此期间触发的操作产生极大延迟和卡顿。需要一层启动覆盖层，在应用完全加载前显示动画，并阻挡所有鼠标事件（移动/悬停/点击）穿透到应用界面。

## 目标

1. 覆盖层显示 FlowFieldBackground 粒子动画 + 中央 "Kora/可燃" SVG 描边动画
2. 覆盖层 `position: fixed; inset: 0; z-index: 9999`，阻挡所有鼠标事件穿透
3. 主题自适应（深色/浅色→背景色、粒子色、文字色随之变化）
4. 语言自适应（zh → "可燃"，其他 → "Kora"）
5. bootstrap Phase 2 完成后覆盖层淡出消失（500ms opacity 过渡 + AnimatePresence）

## 架构

### 组件树

```
<App>
  <Fragment>
    {!t ? <div className="adl-shell adl-ide" /> : <TCopyProvider>...</TCopyProvider>}
    {!appReady && <StartupOverlay />}
  </Fragment>
</App>
```

`StartupOverlay` 使用 `fixed` 定位，覆盖整个视口，不依赖 DOM 层级关系。

### Store 变更

- `StoreState.ts` 新增 `appReady: boolean`
- `workspaceSlice.ts` 初始状态 `appReady: false`
- `generalActions.ts` 的 `bootstrap()` 在两个分支末尾的 `set()` 中添加 `appReady: true`

### 组件层次

```
StartupOverlay (fixed, z-9999, pointer-events: auto)
├── FlowFieldBackground (粒子动画背景)
│   - trailColor: theme-aware ("0,0,0" / "255,255,255")
│   - particleColor: theme-aware ("#818cf8" / "#4f46e5")
│   - bgClass: theme-aware ("bg-black" / "bg-white")
└── div.absolute (居中容器)
    └── svg (motion.text)
        └── "Kora" / "可燃"
            - stroke-dasharray: 5000
            - stroke-dashoffset: 5000 → 0 → -5000 (循环)
            - fill: none, stroke: currentColor (theme-aware)
```

### 数据流

| 数据 | 来源 | 处理 |
|------|------|------|
| 主题 | `document.documentElement.dataset.theme` + `matchMedia` 降级 + `MutationObserver` 监听变更 | 控制背景色、粒子色、文字色 |
| 语言 | `navigator.language` | `startsWith('zh')` → "可燃"，否则 "Kora" |
| appReady | Zustand store | 控制覆盖层显隐 |

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/components/StartupOverlay.tsx` | 新组件，覆盖层容器+SVG 文字动画+主题/语言感知 |
| `frontend/src/app/components/flow-field-background.tsx` | 修改：添加 `trailColor` / `containerClass` prop |
| `frontend/src/app/stores/StoreState.ts` | 添加 `appReady: boolean` |
| `frontend/src/app/stores/slices/workspaceSlice.ts` | 初始状态添加 `appReady: false` |
| `frontend/src/app/stores/actions/generalActions.ts` | bootstrap Phase 2 末尾添加 `appReady: true` |
| `frontend/src/app/App.tsx` | 读取 store.appReady，条件渲染 `<StartupOverlay />` |

## 详细设计

### 1. FlowFieldBackground 修改

新增 props:
- `trailColor?: string` — CSS RGB 值，默认 `'0, 0, 0'`（深色模式）
- `containerClass?: string` — 覆盖容器 className

trail 绘制改为:
```typescript
ctx.fillStyle = `rgba(${trailColor}, ${trailOpacity})`;
```

### 2. StartupOverlay 组件

```typescript
// hooks
- useTheme: 从 data-theme + matchMedia 读取当前主题；MutationObserver 监听变更
- useLanguage: 从 navigator.language 读取，监听 changes

// render
<div className="fixed inset-0 z-9999">
  <FlowFieldBackground
    particleCount={600}
    color={themeColor}
    trailOpacity={0.15}
    trailColor={trailColor}
    containerClass={bgClass}
    speed={1}
  />
  <div className="absolute inset-0 flex items-center justify-center">
    <svg viewBox="0 0 500 120" className="w-80 max-w-[80vw]">
      <motion.text
        x="250" y="60"
        textAnchor="middle" dominantBaseline="central"
        fontSize="80" fontWeight="900"
        fontFamily="system-ui, sans-serif"
        fill="none"
        stroke={textColor}
        strokeWidth={3}
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={5000}
        initial={{ strokeDashoffset: 5000 }}
        animate={{ strokeDashoffset: [5000, 0, -5000] }}
        transition={{
          duration: 3,
          ease: [0.42, 0, 0.58, 1], // inOutQuad
          repeat: Infinity,
        }}
      >
        {displayText}
      </motion.text>
    </svg>
  </div>
</div>
```

### 3. 淡出逻辑

App.tsx 中的 `{!appReady && <StartupOverlay />}` 利用 React 的条件渲染 + `motion` 的 `AnimatePresence`:

```tsx
<AnimatePresence>
  {!appReady && (
    <motion.div
      key="startup-overlay"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <StartupOverlay />
    </motion.div>
  )}
</AnimatePresence>
```

### 4. 主题色映射

| 变量 | 深色模式 | 浅色模式 |
|------|---------|---------|
| bgClass | `bg-black` | `bg-white` |
| trailColor | `0, 0, 0` | `255, 255, 255` |
| 粒子颜色 | `#818cf8` (indigo-400) | `#4f46e5` (indigo-600) |
| 文字描边色 | `#c7d2fe` (indigo-200) | `#3730a3` (indigo-800) |

## 边界情况

| 情况 | 处理 |
|------|------|
| canvas 不支持 | 退化显示纯色背景 + CSS 居中文本 |
| 浏览器无 matchMedia | 默认深色模式 |
| navigator.language 为空 | 默认 "Kora" |
| appReady 在动画中途/瞬间变为 true | AnimatePresence 执行淡出，不受影响 |
| 主题在启动过程中切换 | MutationObserver 即时更新组件样式 |

## 不涉及范围

- 不修改现有 `if (!t) return <div />` guard 逻辑
- 不修改 i18n / TCopyProvider 的加载流程
- 不新增第三方依赖（使用已有 `motion` 库做动画）
