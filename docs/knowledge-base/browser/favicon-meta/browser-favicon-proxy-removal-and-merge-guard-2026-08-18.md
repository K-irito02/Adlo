# 浏览器 favicon 代理兜底移除与镜像合并守卫（2026-08-18）

## 背景

浏览器面板 favicon 显示错误图标 / 多站同图标 / 来回切换，用户验证后确认三个原始问题解决。修复分 Fix A/B/C/D + 兜底图标渲染修正。

## 经验教训

### 1. 外部 favicon 代理服务不可靠，且会被数据合并逻辑"锁死"

- DDG `icons.duckduckgo.com/ip3/{host}.png` 对无收录/无法抓取的域名返回**默认地球图标**（非空白、非错误），且大陆访问不稳定；Google S2 同样。
- 更危险的是：页面无 `<link rel=icon>` 时后端从代理下载（可能是默认地球）存成 data-URI，`should_replace_favicon` 对以 `data:` 开头的既有值恒拒绝替换 → **错误图标永久化**（权威锁死）。
- 教训：外部兜底服务在"拿不到真实图标"时返回的是**合法但错误**的图标，比直接失败更隐蔽。任何从外部服务获取的"权威数据"都必须能表达"无有效结果"，且数据合并规则不能把占位结果当权威锁定。

### 2. 空广播清空前端镜像 → 来回切换（三态循环）

- `get` 失败返回空抓取结果 → 命令层广播空 meta → 前端 `applyBroadcastUpdate` 无条件覆盖镜像 → 真实图标被清 → 前端回落 DDG → 下次成功恢复 → 反复。
- 修复三层同构：① Rust `get` 抓取路径统一返回缓存条目的合并值（失败保留既有 title/favicon/dataUri）；② 预览 `executeFetch` 同构；③ 前端 `applyBroadcastUpdate` 合并守卫（全空广播且有既有条目 → 保留不覆盖，仅 notify；空字段按字段合并）。
- 教训：服务端失败路径返回"空"会被下游当作"成功但为空"处理。**失败必须返回当前最佳已知状态，而不是空状态**；前端广播合并必须区分"无数据"与"清除数据"。

### 3. 去重命中返回空会被误判为失败

- `fetch_page_meta_inner` 3s dedup 命中时返回空 → `get` 按失败处理 `mark_failure` + 空广播。
- 修复：移除 dedup（并发防重由 `get` 单飞行承担，TTL + backoff 短路已覆盖频控）；`get` 增加退避短路 `last_ok_at == 0 && now < next_retry_at` → 直接返回缓存不抓取。
- 教训：去重/缓存的"命中但不返回数据"与"真实失败"必须语义区分，否则缓存层会放大错误（把本该命中缓存的请求变成失败重试）。

### 4. 退避/TTL 短路的返回值必须携带真实缓存键 url

- 预览 `get` 的退避/TTL 短路返回 `url: ''`，命令层按 `meta.url` 广播 → 前端无法匹配任何 tab（R1 回归类别）。Rust 侧是 `PageMeta { url: key, .. }`，预览侧必须同构。
- 教训：三端（Rust / preview / 前端）isomorphic 服务的短路/失败路径，返回值的**每个字段**（含 `url`）都要逐字段对齐，不能只对齐主体字段。

### 5. SVG `make()` 继承描边会破坏填充型图标

- `IconWorld` path 是 `fill="currentColor"` 实心球，经 `make()` 构建后继承 `stroke="currentColor" stroke-width="2"` → 2px 粗描边描出所有边缘，14px 下像厚重表情球（用户确认与设计稿不符）。
- 修复：path 增加 `stroke="none"`；兜底图标用主题 token 定义颜色（深色 `#ffffff` / 浅色继承），不硬编码色值。
- 教训：图标工厂的默认属性（描边）对填充型 path 是破坏性的；新增图标必须显式声明 `stroke`，且图标颜色必须走主题 token。

### 6. 图标颜色的主题 token 化

- 兜底 favicon 颜色硬编码 `#ffffff` 违反"颜色必须 var(--…)"约束 → 新增 token `--adl-browser-tree-fallback-ink`（深色 `#ffffff` / 浅色 `var(--adl-file-badge-ink-default)`）。
- 教训：颜色 token 定义文件（themes.css）是色值的合法出处；组件/样式文件里只允许出现 var 引用。

## 验证

- `cargo test --workspace` 966 通过 0 失败；前端全量 233 文件 1823 测试通过；clippy `-D warnings` 0 警告；fmt/tsc/eslint/prettier 通过。
- 子代理 A 根因验证（两轮 rev1→rev2）+ 子代理 B 死代码清理（两轮 rev1→rev3）均至零问题；"不修复"判定 3 项均认可（L5 存量代理缓存预发布禁止迁移代码 / 冗余广播合并守卫已中和 / 归一化历史遗留）。