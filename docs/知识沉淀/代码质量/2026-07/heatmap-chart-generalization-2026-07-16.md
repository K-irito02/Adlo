# HeatmapChart 泛化经验

## 来源

2026-07-16 HeatmapChart 泛化重构（git-visualization charts 改造）

## 经验

1. **Tooltip 单复数 i18n key 必须分离**：`formatLabel` 回调中 `count === 1 ? singular : plural` 两个分支使用了相同的 i18n key `gitVisCommits`，导致显示 "1 commits"。正确做法是使用 `gitVisContribution` / `gitVisContributions` 这种分离键。

2. **resolvedColumnLabels 必须从 visibleData 而非 data 派生**：HeatmapChart 内部有 raw `data` prop 和经过 xDomain 过滤 + weekStartDay 旋转后的 `visibleData`。若列标签从 `data` 派生，当 xDomain 过滤后索引会错位，导致标签与列不匹配。

3. **X/Y 轴标签容器应设置 overflow: hidden**：当列标签宽度超过 binWidth 时（如中英文模块名长度差异大），标签会重叠。使用 `overflow: hidden` + `text-overflow: ellipsis` + `title` 属性可安全截断。

4. **tickEvery 控制轴标签密度**：列数较多（如 48 列）时，每列都标注会导致严重重叠。新增 `tickEvery` prop 控制每隔 N 列标一个标签，默认 1 以保持向后兼容。

5. **Y 轴 rowLabels 模式下 tickFilter/labelFormat 被忽略**：当提供 `rowLabels` 时，`tickFilter` 和 `labelFormat` props 不生效。这是一个设计决策（自定义标签不需要缩写），但应文档化以避免使用者困惑。
