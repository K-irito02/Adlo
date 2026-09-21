# StartupOverlay — 启动过渡动画覆盖层

## 问题

应用启动后 UI 元素虽可见并可触发 UI/UX 效果，但实际尚未完全加载成功（bootstrap 未完成），用户在此期间触发的操作会导致交互延迟。需要一层启动覆盖层，在应用完全加载前显示动画，并隔离所有鼠标事件。

## 架构

### 两层结构

```
┌─ 静态 HTML preload overlay（index.html）──────────────────┐
│ cursor: default, pointer-events: auto, 纯色背景            │
│ 覆盖从 WebView 加载到 React mount 的空白期                  │
└───────────────────────────────────────────────────────────┘
                            ↓ React mount 时 remove
┌─ StartupOverlay 组件（React，fixed, z-9999）───────────────┐
│ cursor: default, pointer-events: none                     │
│ ├── FlowFieldBackground（OffscreenCanvas + Web Worker）   │
│ └── SVG 描边动画 "Kora" / "可燃"（motion.text）            │
└───────────────────────────────────────────────────────────┘
```

### 时序控制（App.tsx）

```
启动 → startedAt = performance.now()
  ├── 8s 最大超时 → 强制 setOverlayHidden(true)
  └── appReady + t 就绪 → 等待剩余时间到 3.5s → setOverlayHidden(true)
```

- **最短 3.5s**：保证动画效果完整展示
- **最长 8s**：超时强制退出，防止 appReady 卡住导致界面永远不出现

### 组件层次

```
StartupOverlay (fixed, z-9999, pointer-events: none, cursor: default)
├── FlowFieldBackground (粒子动画，OffscreenCanvas + Web Worker)
│   - particleCount: 20（低负载，Worker 独立线程运行）
│   - trailColor: theme-aware ("0,0,0" / "255,255,255")
│   - color: theme-aware ("#818cf8" / "#4f46e5")
│   - bgColor: theme-aware ("#000" / "#fff")
│   - canvas 初始化仅执行一次，颜色变化通过 postMessage 通知 Worker
└── div.absolute (居中容器)
    └── svg (motion.text)
        └── "Kora" / "可燃"
            - stroke-dasharray / stroke-dashoffset 循环动画
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/index.html` | 静态 preload overlay（React mount 前） |
| `frontend/src/app/components/StartupOverlay.tsx` | 覆盖层容器 + SVG 动画 + 主题/语言感知 |
| `frontend/src/app/components/flow-field-background.tsx` | OffscreenCanvas + Worker 桥接组件 |
| `frontend/src/app/components/flow-field-worker.ts` | Web Worker 粒子动画逻辑 |
| `frontend/src/app/App.tsx` | 覆盖层时序控制（3.5s 最短 / 8s 最长） |

### 数据流

| 数据 | 来源 | 处理 |
|------|------|------|
| 主题 | `document.documentElement.dataset.theme` + `matchMedia` 降级 + `MutationObserver` | 控制背景色、粒子色、文字色 |
| 语言 | `navigator.language` | `startsWith('zh')` → "可燃"，否则 "Kora" |
| appReady | Zustand store | 控制覆盖层显隐（配合时序控制） |
| 粒子动画 | Web Worker（独立线程） | 通过 `transferControlToOffscreen` 转移 canvas 控制权 |

## 鼠标事件隔离

- `pointer-events: none` — 覆盖层不接收任何鼠标事件，事件穿透到下层（body/html，无 JS 事件处理器，零开销）
- `cursor: default` — 覆盖层显示普通光标，避免"加载光标"等异常光标样式级联

## 性能优化

- **OffscreenCanvas + Web Worker**：粒子动画在独立线程中运行，主线程零开销
- **particleCount: 20**：低保真粒子数，确保 Worker 线程流畅
- **帧率节流**：30fps（Worker 内部 `FRAME_INTERVAL = 1000/30`）
- **Tauri 命令 async 化**：启动期 I/O 操作移出主线程，避免 tao 事件循环阻塞

## 关键设计决策

### canvas 初始化与颜色更新分离

`transferControlToOffscreen()` 只能调用一次。如果颜色 props 在 `useEffect` 依赖项中，主题切换时 effect 重新执行会抛出异常。因此将 canvas 初始化（空依赖）与颜色更新（`postMessage` 通知 Worker）分离。

### 删除 WM_NCHITTEST 防御层

`overlay_state.rs` 的 `SetWindowSubclass` + WM_NCHITTEST 拦截经日志验证从未触发（`hittest_intercepts=0`），证明对"未响应"问题无效。根因是后端同步命令阻塞，已通过 async 化修复。防御层已删除，避免代码冗余。

## 边界情况

| 情况 | 处理 |
|------|------|
| OffscreenCanvas 不支持 | 退化显示纯色背景（`console.warn`） |
| 浏览器无 matchMedia | 默认深色模式 |
| navigator.language 为空 | 默认 "Kora" |
| appReady 超过 8s 未就绪 | 强制退出覆盖层，显示应用界面 |
| 主题在启动期间切换 | Worker 接收 `updateColors` 消息，无需重建 canvas |

## 相关文档

- [tauri-sync-command-blocking-2026-07-14.md](../../knowledge-base/tauri-backend/tauri-sync-command-blocking-2026-07-14.md) — 启动期"未响应"根因与修复
- [tauri-webview-overlay-hide-2026-06-18.md](../../knowledge-base/browser/webview-embed/tauri-webview-overlay-hide-2026-06-18.md) — 原生 WebView 覆盖层 z-order 问题
