---

## 背景说明

在实际研发管理中，Git 仓库不仅是代码存储库，更是团队协作、项目节奏与技术债的“活地图”。但原始 `git log` 和命令行统计难以直观呈现分支策略、代码热点、成员贡献等深层信息。本文档旨在通过 ECharts 图表库，将常见的 Git 可视化需求转化为直观的图形界面，帮助技术负责人、开发者和质量管理人员快速定位项目状态。以下示例代码中的所有图表均基于模拟数据，可根据实际仓库信息替换数据源。

---

## 可视化详细讲解（共 7 种图表）

### 1. 提交网络图（分支与合并）
- **展示内容**：力导向布局的节点（提交）与边（父子关系），节点颜色区分分支（`main`、`feature-1`、`feature-2`、`hotfix`）。每个节点显示哈希缩写，悬停可查看完整分支信息。
- **使用价值**：直观展示代码合并路径、特性分支生命周期，快速识别是否存在长期未合并的分支或复杂的“网状”历史。
- **交互操作**：支持拖拽节点、缩放视图，便于聚焦特定区域。

### 2. 日历热力图（GitHub 风格）
- **展示内容**：以日历矩阵展示近一年每日提交次数，颜色从浅蓝到深蓝渐变，代表提交活跃度高低。
- **使用价值**：一眼识别项目开发高峰（如版本发布前）和低谷（如假期），辅助资源规划。
- **交互操作**：悬停显示具体日期和提交数。

### 3. 时钟热力图（星期 vs 小时）
- **展示内容**：横轴为一天 24 小时，纵轴为星期几，色块深浅表示该时段提交频次。模拟数据中工作日白天（9-18 点）颜色最深，凌晨和周末颜色较浅。
- **使用价值**：揭示团队工作节奏，判断是否存在“深夜加班”或“无效提交”模式，亦可辅助调整 Code Review 排班。

### 4. 贡献者概览（提交数 + 代码行数）
- **展示内容**：柱状图（蓝色）表示每位作者的提交次数，叠加两条折线：绿色实线为新增行数，红色虚线为删除行数（右轴）。
- **使用价值**：综合评估成员活跃度，避免仅看提交数造成的误导（例如提交多但删行多可能意味着重构较多）。
- **交互操作**：悬停显示具体数值，支持图例切换显隐。

### 5. 文件修改热度 Treemap（矩形树图）
- **展示内容**：按目录层级展示文件或模块，矩形面积代表修改次数/代码量，颜色（红热蓝冷）表示最近修改时间。示例中 `src/components/Header.vue` 等模块颜色偏暖，表明近期频繁改动。
- **使用价值**：快速定位“热点文件”与“腐化模块”，为重构优先级提供依据。同时也能识别长期未动的“冷门”代码。

### 6. 代码行数演变（累计新增/删除）
- **展示内容**：面积堆叠图展示随时间（按周采样）累计新增行数（绿色）和累计删除行数（红色）。两条曲线上升坡度反映代码库增长或重构力度。
- **使用价值**：观察项目规模变化，识别大规模重构（删除线陡增）或快速迭代期（新增线陡增），结合版本发布节点可评估代码稳定性。

### 7. 协作桑基图（作者 → 模块）
- **位置**：第三行右侧。
- **展示内容**：左侧节点为贡献者（Alex 等），右侧节点为模块（前端、后端、数据库等），连接线的宽度代表该作者对该模块的修改贡献量（模拟值）。
- **使用价值**：清晰展示团队成员的技术专长领域，检测“模块孤岛”（仅一人维护）或“全栈型选手”，为人员调度和知识传递提供参考。

---

## 优化建议

1. **数据接入**  
   当前所有图表使用静态模拟数据。实际使用时，您可以通过 `git log --pretty=format` 结合 `awk`、`jq` 等工具提取提交时间、作者、文件路径、增删行数等信息，转换为 JSON 格式后注入到 ECharts 的 `data` 字段中。

2. **性能与刷新**  
   对于大型仓库（数万次提交），建议在服务端预聚合数据（如按月汇总），避免前端渲染卡顿。同时可增加定时刷新或 WebSocket 实时更新（配合 CI 触发）。

3. **交互增强**  
   - 为提交网络图增加“单击节点跳转到 Git 托管平台查看详情”功能。  
   - 为日历热力图增加“点击日期显示当日提交列表”弹窗。  
   - 为 Treemap 增加“钻取”功能，支持展开子目录。

4. **主题与品牌**  
   可根据团队或产品风格调整 ECharts 主题色，并增加深色模式切换。

---

## 完整 HTML 代码

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git 项目可视化全览 · 模拟演示</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            background: #f5f7fa;
            font-family: 'Segoe UI', Roboto, system-ui, sans-serif;
            padding: 24px;
        }
        .container {
            max-width: 1600px;
            margin: 0 auto;
        }
        h1 {
            font-weight: 300;
            font-size: 2.2rem;
            color: #1e293b;
            margin-bottom: 8px;
            letter-spacing: 1px;
        }
        .subhead {
            color: #64748b;
            margin-bottom: 32px;
            font-size: 1rem;
            border-left: 4px solid #3b82f6;
            padding-left: 16px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(540px, 1fr));
            gap: 24px;
        }
        .card {
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
            padding: 16px 16px 8px 16px;
            transition: box-shadow 0.2s;
            display: flex;
            flex-direction: column;
        }
        .card:hover {
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.10);
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 8px;
            padding: 0 4px;
        }
        .card-header h3 {
            font-weight: 600;
            font-size: 1.1rem;
            color: #0f172a;
        }
        .card-header .badge {
            font-size: 0.7rem;
            background: #e2e8f0;
            color: #334155;
            padding: 2px 10px;
            border-radius: 20px;
            font-weight: 500;
        }
        .chart-container {
            width: 100%;
            height: 360px;
            flex-shrink: 0;
        }
        .card-desc {
            font-size: 0.8rem;
            color: #64748b;
            padding: 8px 4px 0 4px;
            border-top: 1px solid #f1f5f9;
            margin-top: 6px;
        }
        /* 对于特别高的图，调整高度 */
        .tall .chart-container {
            height: 420px;
        }
        @media (max-width: 600px) {
            .grid {
                grid-template-columns: 1fr;
            }
            .chart-container {
                height: 300px;
            }
            .tall .chart-container {
                height: 340px;
            }
        }
    </style>
</head>
<body>
<div class="container">
    <h1>📊 Git 项目可视化 · 六大维度示例</h1>
    <div class="subhead">
        基于模拟数据展示提交网络、时间热力、贡献者协作、代码演变、质量风险等可视化形态
    </div>

    <div class="grid">

        <!-- 1. 提交网络图 (DAG) -->
        <div class="card">
            <div class="card-header">
                <h3>🌿 提交网络 · 分支与合并</h3>
                <span class="badge">维度 1</span>
            </div>
            <div id="chart-graph" class="chart-container"></div>
            <div class="card-desc">节点 = 提交（哈希缩写），边 = 父子关系，颜色区分分支，箭头指向父提交。</div>
        </div>

        <!-- 2. 日历热力图 (GitHub 风格) -->
        <div class="card">
            <div class="card-header">
                <h3>📅 提交日历热力图</h3>
                <span class="badge">维度 2</span>
            </div>
            <div id="chart-calendar" class="chart-container"></div>
            <div class="card-desc">近一年每日提交次数，颜色越深提交越密集，可快速识别活跃周期。</div>
        </div>

        <!-- 3. 时钟热力图 (星期 vs 小时) -->
        <div class="card">
            <div class="card-header">
                <h3>⏰ 提交时间分布</h3>
                <span class="badge">维度 2</span>
            </div>
            <div id="chart-clock" class="chart-container"></div>
            <div class="card-desc">纵轴 = 星期，横轴 = 小时，色块表示该时段提交频次，发现团队工作节奏。</div>
        </div>

        <!-- 4. 贡献者统计 (提交数 + 代码行数) -->
        <div class="card">
            <div class="card-header">
                <h3>👥 贡献者概览</h3>
                <span class="badge">维度 3</span>
            </div>
            <div id="chart-contributors" class="chart-container"></div>
            <div class="card-desc">柱状图：提交次数；折线：新增/删除行数（右轴），综合评估活跃度。</div>
        </div>

        <!-- 5. 文件树状图 (修改频率) -->
        <div class="card tall">
            <div class="card-header">
                <h3>📁 文件修改热度 Treemap</h3>
                <span class="badge">维度 4</span>
            </div>
            <div id="chart-treemap" class="chart-container"></div>
            <div class="card-desc">矩形面积 = 修改次数/代码量，颜色 = 最近修改时间（红热蓝冷），定位“热点文件”。</div>
        </div>

        <!-- 6. 代码行数变动历史 (新增/删除) -->
        <div class="card tall">
            <div class="card-header">
                <h3>📈 代码行数演变</h3>
                <span class="badge">维度 4 & 5</span>
            </div>
            <div id="chart-lines" class="chart-container"></div>
            <div class="card-desc">累计新增（+）与删除（-）行数，瀑布式堆叠，反映项目增长与重构节奏。</div>
        </div>

        <!-- 7. 协作桑基图 (作者 → 模块) -->
        <div class="card" style="grid-column: span 1;">
            <div class="card-header">
                <h3>🔀 协作桑基图</h3>
                <span class="badge">维度 3</span>
            </div>
            <div id="chart-sankey" class="chart-container"></div>
            <div class="card-desc">左侧 = 作者，右侧 = 模块，流宽度 = 修改贡献量，识别“模块孤岛”或“全能型选手”。</div>
        </div>

    </div>
    <p style="margin-top: 32px; color: #94a3b8; font-size: 0.85rem; text-align: center;">
        ⚡ 所有数据均为模拟生成，用于展示可视化效果。实际接入 Git 仓库时，需提取真实数据并适配。
    </p>
</div>

<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<script>
    (function () {
        // ---------- 工具函数：生成随机颜色 ----------
        function getBranchColor(branch) {
            const map = {
                'main': '#3b82f6',
                'feature-1': '#f59e0b',
                'feature-2': '#10b981',
                'hotfix': '#ef4444',
                'release': '#8b5cf6'
            };
            return map[branch] || '#94a3b8';
        }

        // ---------- 1. 提交网络图 (graph) ----------
        (function () {
            const dom = document.getElementById('chart-graph');
            const chart = echarts.init(dom);
            // 模拟提交节点
            const nodes = [
                { id: 'a1', name: 'a1b2c3', branch: 'main', date: '2026-01-01', value: 1 },
                { id: 'a2', name: 'd4e5f6', branch: 'main', date: '2026-01-03', value: 1 },
                { id: 'a3', name: 'g7h8i9', branch: 'main', date: '2026-01-05', value: 1 },
                { id: 'b1', name: 'j0k1l2', branch: 'feature-1', date: '2026-01-06', value: 1 },
                { id: 'b2', name: 'm3n4o5', branch: 'feature-1', date: '2026-01-08', value: 1 },
                { id: 'b3', name: 'p6q7r8', branch: 'feature-1', date: '2026-01-10', value: 1 },
                { id: 'c1', name: 's9t0u1', branch: 'feature-2', date: '2026-01-07', value: 1 },
                { id: 'c2', name: 'v2w3x4', branch: 'feature-2', date: '2026-01-09', value: 1 },
                { id: 'c3', name: 'y5z6a7', branch: 'feature-2', date: '2026-01-11', value: 1 },
                { id: 'merge1', name: 'b8c9d0', branch: 'main', date: '2026-01-12', value: 1 },
                { id: 'hotfix1', name: 'e1f2g3', branch: 'hotfix', date: '2026-01-13', value: 1 },
                { id: 'merge2', name: 'h4i5j6', branch: 'main', date: '2026-01-14', value: 1 },
            ];
            const edges = [
                { source: 'a2', target: 'a1' },
                { source: 'a3', target: 'a2' },
                { source: 'b1', target: 'a3' },
                { source: 'b2', target: 'b1' },
                { source: 'b3', target: 'b2' },
                { source: 'c1', target: 'a3' },
                { source: 'c2', target: 'c1' },
                { source: 'c3', target: 'c2' },
                { source: 'merge1', target: 'b3' },
                { source: 'merge1', target: 'c3' },
                { source: 'hotfix1', target: 'merge1' },
                { source: 'merge2', target: 'hotfix1' },
                { source: 'merge2', target: 'a3' }, // 模拟合并回到主分支
            ];
            // 为节点添加样式
            const graphNodes = nodes.map(n => ({
                id: n.id,
                name: n.name,
                symbolSize: 28,
                category: n.branch,
                itemStyle: { color: getBranchColor(n.branch) },
                label: { show: true, position: 'bottom', fontSize: 10, color: '#334155' }
            }));
            const categories = ['main', 'feature-1', 'feature-2', 'hotfix'].map(b => ({
                name: b,
                itemStyle: { color: getBranchColor(b) }
            }));
            const option = {
                title: { show: false },
                tooltip: {
                    trigger: 'item',
                    formatter: function (params) {
                        if (params.dataType === 'node') {
                            return `提交 ${params.data.name}<br/>分支: ${params.data.category}`;
                        } else {
                            return `父提交 → 子提交`;
                        }
                    }
                },
                legend: {
                    data: categories.map(c => c.name),
                    orient: 'horizontal',
                    left: 'left',
                    bottom: 0,
                    icon: 'circle',
                    textStyle: { fontSize: 11 }
                },
                series: [{
                    type: 'graph',
                    layout: 'force',
                    force: {
                        repulsion: 300,
                        edgeLength: [80, 150],
                        gravity: 0.1,
                        friction: 0.1
                    },
                    roam: true,
                    draggable: true,
                    data: graphNodes,
                    links: edges,
                    categories: categories,
                    edgeSymbol: ['none', 'arrow'],
                    edgeSymbolSize: [0, 10],
                    edgeLabel: { show: false },
                    lineStyle: {
                        color: '#94a3b8',
                        width: 2,
                        curveness: 0.2
                    },
                    label: {
                        show: true,
                        position: 'bottom',
                        fontSize: 9,
                        color: '#475569'
                    },
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: { width: 3 }
                    }
                }]
            };
            chart.setOption(option);
            window.addEventListener('resize', () => chart.resize());
        })();

        // ---------- 2. 日历热力图 ----------
        (function () {
            const dom = document.getElementById('chart-calendar');
            const chart = echarts.init(dom);
            const startDate = new Date('2025-07-01');
            const endDate = new Date('2026-06-30');
            const data = [];
            let cur = new Date(startDate);
            while (cur <= endDate) {
                const count = Math.floor(Math.random() * 8); // 0-7
                if (count > 0) {
                    const dateStr = cur.getFullYear() + '-' +
                        String(cur.getMonth() + 1).padStart(2, '0') + '-' +
                        String(cur.getDate()).padStart(2, '0');
                    data.push([dateStr, count]);
                }
                cur.setDate(cur.getDate() + 1);
            }
            const option = {
                title: { show: false },
                visualMap: {
                    min: 0,
                    max: 7,
                    calculable: true,
                    orient: 'horizontal',
                    left: 'center',
                    bottom: 0,
                    text: ['高', '低'],
                    textStyle: { fontSize: 10 },
                    inRange: {
                        color: ['#e2e8f0', '#bfdbfe', '#60a5fa', '#2563eb']
                    }
                },
                calendar: {
                    range: ['2025-07-01', '2026-06-30'],
                    cellSize: ['auto', 16],
                    splitLine: { show: false },
                    itemStyle: {
                        borderWidth: 0.5,
                        borderColor: '#f1f5f9'
                    },
                    yearLabel: { show: true, fontSize: 12 },
                    monthLabel: { show: true, fontSize: 10 }
                },
                series: [{
                    type: 'heatmap',
                    coordinateSystem: 'calendar',
                    data: data,
                    label: {
                        show: false
                    }
                }]
            };
            chart.setOption(option);
            window.addEventListener('resize', () => chart.resize());
        })();

        // ---------- 3. 时钟热力图 (小时 vs 星期) ----------
        (function () {
            const dom = document.getElementById('chart-clock');
            const chart = echarts.init(dom);
            const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const hours = Array.from({ length: 24 }, (_, i) => i);
            const data = [];
            for (let d = 0; d < 7; d++) {
                for (let h = 0; h < 24; h++) {
                    let base = 0;
                    // 模拟工作时间 9-18 点提交多，凌晨少
                    if (h >= 9 && h <= 18) base = Math.floor(Math.random() * 6) + 3;
                    else if (h >= 19 && h <= 23) base = Math.floor(Math.random() * 3);
                    else base = Math.floor(Math.random() * 2);
                    // 周末减少
                    if (d === 0 || d === 6) base = Math.floor(base * 0.3);
                    data.push([h, d, base]);
                }
            }
            const option = {
                title: { show: false },
                tooltip: {
                    formatter: function (params) {
                        return `${days[params.value[1]]} ${params.value[0]}:00<br/>提交次数: ${params.value[2]}`;
                    }
                },
                visualMap: {
                    min: 0,
                    max: 8,
                    calculable: true,
                    orient: 'horizontal',
                    left: 'center',
                    bottom: 0,
                    text: ['多', '少'],
                    textStyle: { fontSize: 10 },
                    inRange: {
                        color: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#1e40af']
                    }
                },
                xAxis: {
                    type: 'category',
                    data: hours.map(h => h + 'h'),
                    splitLine: { show: false },
                    axisLabel: { fontSize: 9, interval: 2 }
                },
                yAxis: {
                    type: 'category',
                    data: days,
                    splitLine: { show: false },
                    axisLabel: { fontSize: 10 }
                },
                series: [{
                    type: 'heatmap',
                    data: data,
                    label: {
                        show: false
                    },
                    emphasis: {
                        itemStyle: {
                            borderColor: '#333',
                            borderWidth: 1
                        }
                    }
                }]
            };
            chart.setOption(option);
            window.addEventListener('resize', () => chart.resize());
        })();

        // ---------- 4. 贡献者统计 (柱状+折线) ----------
        (function () {
            const dom = document.getElementById('chart-contributors');
            const chart = echarts.init(dom);
            const authors = ['Alex', 'Ben', 'Cara', 'Diana', 'Evan', 'Fiona'];
            const commits = [45, 38, 27, 53, 19, 32];
            const added = [3200, 2800, 1500, 4100, 900, 2200];
            const deleted = [1200, 800, 600, 1800, 300, 700];
            const option = {
                title: { show: false },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function (params) {
                        let res = `<strong>${params[0].axisValue}</strong><br/>`;
                        params.forEach(p => {
                            if (p.seriesName) res += `${p.marker} ${p.seriesName}: ${p.value}<br/>`;
                        });
                        return res;
                    }
                },
                legend: {
                    data: ['提交数', '新增行数', '删除行数'],
                    left: 'left',
                    top: 0,
                    icon: 'roundRect',
                    textStyle: { fontSize: 11 }
                },
                grid: {
                    left: '8%',
                    right: '12%',
                    top: '18%',
                    bottom: '12%'
                },
                xAxis: {
                    type: 'category',
                    data: authors,
                    axisLabel: { fontSize: 11 }
                },
                yAxis: [
                    {
                        type: 'value',
                        name: '提交数',
                        nameTextStyle: { fontSize: 10 },
                        axisLabel: { fontSize: 10 }
                    },
                    {
                        type: 'value',
                        name: '代码行数',
                        nameTextStyle: { fontSize: 10 },
                        axisLabel: { fontSize: 10 },
                        splitLine: { show: false }
                    }
                ],
                series: [
                    {
                        name: '提交数',
                        type: 'bar',
                        data: commits,
                        itemStyle: { color: '#3b82f6' },
                        barWidth: 20
                    },
                    {
                        name: '新增行数',
                        type: 'line',
                        yAxisIndex: 1,
                        data: added,
                        smooth: true,
                        lineStyle: { color: '#10b981', width: 2 },
                        symbol: 'circle',
                        symbolSize: 8,
                        itemStyle: { color: '#10b981' }
                    },
                    {
                        name: '删除行数',
                        type: 'line',
                        yAxisIndex: 1,
                        data: deleted,
                        smooth: true,
                        lineStyle: { color: '#ef4444', width: 2, type: 'dashed' },
                        symbol: 'diamond',
                        symbolSize: 8,
                        itemStyle: { color: '#ef4444' }
                    }
                ]
            };
            chart.setOption(option);
            window.addEventListener('resize', () => chart.resize());
        })();

        // ---------- 5. 文件树状图 (Treemap) ----------
        (function () {
            const dom = document.getElementById('chart-treemap');
            const chart = echarts.init(dom);
            const data = {
                name: 'root',
                children: [
                    {
                        name: 'src',
                        children: [
                            { name: 'main.js', value: 120, itemStyle: { color: '#3b82f6' } },
                            { name: 'utils.js', value: 85, itemStyle: { color: '#60a5fa' } },
                            { name: 'api.js', value: 65, itemStyle: { color: '#93c5fd' } },
                            { name: 'components',
                                children: [
                                    { name: 'Header.vue', value: 45, itemStyle: { color: '#f59e0b' } },
                                    { name: 'Footer.vue', value: 30, itemStyle: { color: '#fbbf24' } },
                                    { name: 'Sidebar.vue', value: 55, itemStyle: { color: '#fcd34d' } }
                                ] }
                        ]
                    },
                    {
                        name: 'tests',
                        children: [
                            { name: 'test_main.js', value: 40, itemStyle: { color: '#10b981' } },
                            { name: 'test_utils.js', value: 35, itemStyle: { color: '#34d399' } }
                        ]
                    },
                    {
                        name: 'docs',
                        children: [
                            { name: 'README.md', value: 20, itemStyle: { color: '#8b5cf6' } },
                            { name: 'CONTRIBUTING.md', value: 15, itemStyle: { color: '#a78bfa' } }
                        ]
                    },
                    {
                        name: 'config',
                        children: [
                            { name: 'webpack.config.js', value: 25, itemStyle: { color: '#ef4444' } },
                            { name: 'eslint.json', value: 10, itemStyle: { color: '#f87171' } }
                        ]
                    }
                ]
            };
            const option = {
                title: { show: false },
                tooltip: {
                    formatter: function (info) {
                        return `<strong>${info.name}</strong><br/>修改热度: ${info.value}`;
                    }
                },
                series: [{
                    type: 'treemap',
                    data: [data],
                    leafDepth: 2,
                    label: {
                        show: true,
                        position: 'inside',
                        fontSize: 11,
                        color: '#1e293b',
                        formatter: function (info) {
                            return info.name.length > 12 ? info.name.slice(0, 10) + '…' : info.name;
                        }
                    },
                    upperLabel: {
                        show: true,
                        position: 'inside',
                        fontSize: 12,
                        fontWeight: 'bold',
                        color: '#0f172a'
                    },
                    itemStyle: {
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        gapWidth: 2
                    },
                    emphasis: {
                        itemStyle: {
                            borderColor: '#1e293b',
                            borderWidth: 3
                        }
                    }
                }]
            };
            chart.setOption(option);
            window.addEventListener('resize', () => chart.resize());
        })();

        // ---------- 6. 代码行数变动历史 (累计新增/删除) ----------
        (function () {
            const dom = document.getElementById('chart-lines');
            const chart = echarts.init(dom);
            const dates = [];
            const added = [];
            const deleted = [];
            let baseAdd = 5000,
                baseDel = 2000;
            const now = new Date('2026-01-01');
            for (let i = 0; i < 40; i++) {
                const d = new Date(now);
                d.setDate(d.getDate() - (39 - i) * 7);
                dates.push((d.getMonth() + 1) + '/' + d.getDate());
                // 模拟起伏
                const addDelta = Math.floor(Math.random() * 600) + 100;
                const delDelta = Math.floor(Math.random() * 300) + 50;
                baseAdd += addDelta;
                baseDel += delDelta;
                added.push(baseAdd);
                deleted.push(baseDel);
            }
            const option = {
                title: { show: false },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'cross' },
                    formatter: function (params) {
                        let res = `<strong>${params[0].axisValue}</strong><br/>`;
                        params.forEach(p => {
                            res += `${p.marker} ${p.seriesName}: ${p.value} 行<br/>`;
                        });
                        return res;
                    }
                },
                legend: {
                    data: ['累计新增', '累计删除'],
                    left: 'left',
                    top: 0,
                    textStyle: { fontSize: 11 }
                },
                grid: {
                    left: '8%',
                    right: '8%',
                    top: '18%',
                    bottom: '12%'
                },
                xAxis: {
                    type: 'category',
                    data: dates,
                    axisLabel: { fontSize: 9, interval: 3 }
                },
                yAxis: {
                    type: 'value',
                    name: '代码行数',
                    nameTextStyle: { fontSize: 10 },
                    axisLabel: { fontSize: 10 }
                },
                series: [
                    {
                        name: '累计新增',
                        type: 'line',
                        data: added,
                        smooth: true,
                        lineStyle: { color: '#10b981', width: 3 },
                        areaStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: 'rgba(16,185,129,0.4)' },
                                { offset: 1, color: 'rgba(16,185,129,0.02)' }
                            ])
                        },
                        symbol: 'none'
                    },
                    {
                        name: '累计删除',
                        type: 'line',
                        data: deleted,
                        smooth: true,
                        lineStyle: { color: '#ef4444', width: 3 },
                        areaStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: 'rgba(239,68,68,0.3)' },
                                { offset: 1, color: 'rgba(239,68,68,0.02)' }
                            ])
                        },
                        symbol: 'none'
                    }
                ]
            };
            chart.setOption(option);
            window.addEventListener('resize', () => chart.resize());
        })();

        // ---------- 7. 协作桑基图 (作者 → 模块) ----------
        (function () {
            const dom = document.getElementById('chart-sankey');
            const chart = echarts.init(dom);
            const option = {
                title: { show: false },
                tooltip: {
                    trigger: 'item',
                    triggerOn: 'mousemove',
                    formatter: function (params) {
                        if (params.dataType === 'edge') {
                            return `${params.data.source} → ${params.data.target}<br/>贡献量: ${params.value}`;
                        } else {
                            return `${params.name}<br/>总量: ${params.value}`;
                        }
                    }
                },
                series: [{
                    type: 'sankey',
                    layout: 'none',
                    emphasis: { focus: 'adjacency' },
                    data: [
                        { name: 'Alex' },
                        { name: 'Ben' },
                        { name: 'Cara' },
                        { name: 'Diana' },
                        { name: 'Evan' },
                        { name: 'Fiona' },
                        { name: '前端' },
                        { name: '后端' },
                        { name: '数据库' },
                        { name: '测试' },
                        { name: '文档' }
                    ],
                    links: [
                        { source: 'Alex', target: '前端', value: 80 },
                        { source: 'Alex', target: '后端', value: 30 },
                        { source: 'Ben', target: '前端', value: 20 },
                        { source: 'Ben', target: '后端', value: 70 },
                        { source: 'Ben', target: '数据库', value: 40 },
                        { source: 'Cara', target: '后端', value: 60 },
                        { source: 'Cara', target: '测试', value: 50 },
                        { source: 'Diana', target: '前端', value: 90 },
                        { source: 'Diana', target: '文档', value: 30 },
                        { source: 'Evan', target: '数据库', value: 80 },
                        { source: 'Evan', target: '测试', value: 20 },
                        { source: 'Fiona', target: '文档', value: 70 },
                        { source: 'Fiona', target: '测试', value: 40 }
                    ],
                    label: {
                        fontSize: 11,
                        color: '#1e293b'
                    },
                    lineStyle: {
                        color: 'gradient',
                        curveness: 0.5
                    },
                    itemStyle: {
                        borderColor: '#ffffff',
                        borderWidth: 1
                    }
                }]
            };
            chart.setOption(option);
            window.addEventListener('resize', () => chart.resize());
        })();

    })();
</script>
</body>
</html>
```