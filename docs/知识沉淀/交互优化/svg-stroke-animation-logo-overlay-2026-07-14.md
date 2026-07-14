# SVG 描边动画实现经验 (2026-07-14)

## 背景

将启动覆盖层的静态文字描边动画替换为 Logo 矢量图形描边动画。Logo 为 PNG 位图，需先矢量化。

## 关键技术决策

### 1. 位图矢量化方案

- **工具**: OpenCV 轮廓检测 (`cv2.findContours`)
- **处理流程**: 灰度化 → 二值化 → 轮廓查找 → 多边形简化 → 生成 `<path d="...">`
- **注意**: OpenCV 在 Windows 下无法直接使用 `cv2.imread()` 读取中文路径文件，需改用 `imdecode` + `np.frombuffer`
- **输出质量**: Polygon approximation 生成的路径为直线段 (`L` 命令)，非贝塞尔曲线 (`C`/`Q`)，适合描边动画但视觉不够平滑

### 2. 动画引擎选择的教训

经历了三个方案迭代：

| 方案 | 问题 | 结论 |
|------|------|------|
| CSS `@keyframes` + `strokeDashoffset` | 缓动效果不精确，`animation` 简写与 `animationDelay` 混用引发浏览器 warning | CSS 动画不适合复杂 SVG 路径动画 |
| Framer Motion `motion.path` | `repeat: Infinity` + SVG 属性 keyframes 在循环后会出现同步衰减，导致所有路径动画逐渐对齐 | Framer Motion 的 SVG 属性循环动画不可靠 |
| **`requestAnimationFrame` + 手动计算** | 完全可控，时序精确，无衰减 | ✅ **最终方案** |

### 3. 关键实现细节

- 每个路径独立测量 `getTotalLength()` 计算 `strokeDasharray`
- 使用 `easeInOutCubic` 缓动实现描边的淡入淡出感
- 路径按平均 X 坐标排序 (`avgX`) 确保从左到右错峰
- `performance.now() + delay * 1000` 精确控制每条路径的起始时间
- 避免在 `useEffect` 中重复初始化，使用 `ref` 守卫防止动画重置

### 4. 像素缩放处理

Canvas DPR 缩放使用 `OffscreenCanvas.width * devicePixelRatio` + `ctx.scale(dpr, dpr)`，确保在高 DPI 屏幕上清晰显示。

## 可复用模式

- 对于需要精确时序控制的 SVG 路径动画，优先选择 `requestAnimationFrame` 而非 CSS/framer-motion
- 路径左→右排序使用正则提取 M/L 命令后的 X 坐标取平均
- 动态粒子数使用正弦波动 ±30% 可产生自然呼吸效果
