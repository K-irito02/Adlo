# Vitest 动态 import mock 偶发失效与首屏竞态（2026-10-11）

来源：内容显示区 PDF 预览（`PdfPreview` 切文档单测偶发 `DOMMatrix is not defined`）。

## 现象

单测在同一文件内多次触发组件的 `await import('pdfjs-dist')` 后，某次 import 求值了**真实模块**
（堆栈：`pdfjs-dist/build/.../canvas.js` 顶层 `new DOMMatrix()` → jsdom 无此 API → import 被拒），
而非 `vi.mock` 工厂。表现为：翻页/切文档测试偶发失败，且与组件逻辑修改无关。

## 根因（两层）

1. **测试环境层**：vite-node 对重复动态 `import()` 的 mock 解析偶发失效（真实模块被求值）。
   生产 bundler 按模块缓存 chunk，无此路径——属测试环境特有 flake，但暴露了第二层真问题。
2. **组件真竞态**：切文档时"重置 effect + 解析 effect"各解析一次（后写者胜），
   首屏绘制与 canvas 挂载（`numPages>0` 才挂载）存在时序竞态——`setNumPages` 后同 tick 直接
   paint 读到旧 DOM（`null`）即丢弃首屏，且无人补画。

## 修复

- `pdf.js` 改模块级单例加载器（`loadPdfJs`）：动态 import 只执行一次，懒加载保留；
  加载失败置空 Promise，允许下次挂载重试（不粘滞拒绝）。
- effect 职责二分：加载 effect 只做"重置 + 解析 + `setNumPages`"；
  绘制 effect（含首屏补画）依赖 `[data, currentPage, numPages, paintPage]`，
  解析完成 `setNumPages` 后重跑，正好补上首屏第一帧。
- 切文档单测连跑 3 次全绿锁定确定性；另加首屏 paint 回归单测（断言画布尺寸被设为视口尺寸）。

## 教训

- 偶发单测失败先看堆栈归属：若堆栈指向 `node_modules` 真实模块求值，优先怀疑 mock 机制，
  用"调用计数 + insight 日志"二分，而非反复改业务代码。
- `vi.mock` + 同一文件内多次动态 import 是已知不稳定组合；被测组件应尽量单次 import
  （单例/顶层），既是生产优化，也是测试确定性保障。
- 条件挂载的 canvas + 同 tick 绘制是经典竞态：绘制必须由"挂载完成"驱动
  （如依赖 `numPages` 的 effect），而不是"解析完成"后立即绘制。
