# SVG 图标系统规范 (Icon System)

> **禁止使用 emoji 图标**，统一采用 SVG 格式矢量图标
>
> 图标支持 `currentColor` 自适应主题色，按需加载，tree-shakable

## 1. 核心原则

| 原则 | 说明 |
|------|------|
| **SVG 唯一** | 所有 UI 图标必须为 SVG 格式，严禁使用 emoji / 图片字体 / PNG |
| **currentColor** | 所有图标的 `fill` 和 `stroke` 使用 `currentColor`，随主题自动变色 |
| **统一风格** | 全部图标来自同一视觉体系（Lucide 风格：2px stroke-width, 2px 圆角） |
| **按需加载** | 每个图标独立文件，支持 tree-shaking，不使用的图标不会打包 |
| **语义命名** | 图标名使用 kebab-case 语义化名称（如 `file-search` 而非 `icon-42`） |

## 2. 图标尺寸标准化

### 尺寸令牌 (Icon Size Tokens)

| 令牌名 | 值 | ViewBox | 使用场景 |
|--------|-----|---------|----------|
| `icon-xs` | 12px | 0 0 24 24 | 极小内联图标（表格状态点、紧凑标签） |
| `icon-sm` | 16px | 0 0 24 24 | 小图标（按钮内、列表项前缀、Badge 内） |
| `icon-md` | 20px | 0 0 24 24 | 标准图标（导航栏、菜单项、Input 前缀） |
| `icon-lg` | 24px | 0 0 24 24 | **默认尺寸**（页面级图标、Card 头部图标） |
| `icon-xl` | 32px | 0 0 24 24 | 大图标（空状态插图、Feature 卡片图标） |
| `icon-2xl` | 48px | 0 0 24 24 | 特大图标（Hero 区域、Onboarding 步骤图标） |

### 尺寸选择指南

| 场景 | 推荐尺寸 | 说明 |
|------|----------|------|
| Button 内图标 (Small) | `icon-sm` (16px) | 小型按钮内部 |
| Button 内图标 (Default) | `icon-md` (20px) | 标准按钮内部 |
| 导航栏图标 | `icon-lg` (24px) | Sidebar Nav Item |
| 表格操作列图标 | `icon-sm` (16px) | 编辑/删除/查看等操作按钮 |
| 状态指示图标 | `icon-xs` ~ `icon-sm` (12~16px) | 在线/离线/错误状态点 |
| 空状态插图 | `icon-xl` ~ `icon-2xl` (32~48px) | 无数据时的装饰性大图标 |
| Feature 展示图标 | `icon-xl` (32px) | 功能介绍卡片中的主图标 |
| Logo / 品牌 Icon | 自定义尺寸 | 不受此规范约束 |

## 3. 图标分类体系

### 3.1 分类目录结构

```
icons/
├── navigation/          导航类
│   ├── arrow-left.svg
│   ├── arrow-right.svg
│   ├── arrow-up.svg
│   ├── arrow-down.svg
│   ├── chevron-left.svg
│   ├── chevron-right.svg
│   ├── chevron-up.svg
│   ├── chevron-down.svg
│   ├── menu.svg
│   ├── more-horizontal.svg
│   └── more-vertical.svg
├── action/              操作类
│   ├── plus.svg
│   ├── minus.svg
│   ├── x.svg (close)
│   ├── check.svg
│   ├── pencil/edit.svg
│   ├── trash/delete.svg
│   ├── copy.svg
│   ├── clipboard.svg
│   ├── refresh-cw.svg
│   ├── download.svg
│   ├── upload.svg
│   ├── search.svg
│   ├── filter.svg
│   └── settings.svg
├── file/                文件类
│   ├── file.svg
│   ├── folder.svg
│   ├── folder-open.svg
│   ├── file-text.svg
│   ├── file-code.svg
│   ├── file-json.svg
│   ├── image.svg
│   └── archive.zip
├── status/              状态类
│   ├── check-circle.svg
│   ├── x-circle.svg
│   ├── alert-circle.svg
│   ├── alert-triangle.svg
│   ├── info.svg
│   ├── loader/spinner.svg
│   ├── clock.svg
│   └── zap.svg
├── ui/                  UI 元件类
│   ├── eye.svg / eye-off.svg
│   ├── lock.svg / unlock.svg
│   ├── heart.svg
│   ├── star.svg
│   ├── bookmark.svg
│   ├── tag.svg
│   ├── hash.svg
│   ├── globe.svg
│   └── link.svg
├── workspace/           工作区专属（Phase 0 核心）
│   ├── workspace.svg
│   ├── git-branch.svg
│   ├── git-commit.svg
│   ├── git-pull-request.svg
│   ├── git-merge.svg
│   ├── terminal.svg
│   ├── database.svg
│   ├── index/build.svg
│   ├── layers.svg
│   └── shield-check.svg
├── task/                任务与审批专属
│   ├── checklist.svg
│   ├── clipboard-check.svg
│   ├── user-check.svg
│   ├── user-x.svg
│   ├── gavel.svg (approval)
│   ├── hourglass.svg
│   └── flag.svg
└── brand/               品牌图标（极少）
    └── logo.svg
```

### 3.2 Phase 0 必需图标清单（最小集）

以下图标是第一阶段 UI 文档中明确出现的，必须实现：

#### 导航类 (10 个)

| 图标名 | 用途 | 出现位置 |
|--------|------|----------|
| `house` | 首页/Dashboard | 侧边导航 |
| `folder` | 工作区管理 | 侧边导航 + 工作区页 |
| `search` | 检索/搜索 | 侧边导航 + 搜索框 |
| `clipboard-list` | 任务中心 | 侧边导航 |
| `file-text` | 日志查看器 | 侧边导航 |
| `settings` | 设置页 | 侧边导航 |
| `chevron-left/right` | 折叠/展开 | 树形节点、Accordion |
| `chevron-down` | 下拉选择器 | Select、Dropdown |
| `arrow-left` | 返回/后退 | Breadcrumb、Modal 返回 |
| `menu` | 更多选项 | Overflow Menu、汉堡菜单 |

#### 操作类 (15 个)

| 图标名 | 用途 | 出现位置 |
|--------|------|----------|
| `plus` | 新建/添加 | 各处新建按钮 |
| `x/close` | 关闭 | Modal、Toast、Tag 删除 |
| `check` | 确认/完成 | Checkbox、成功态 |
| `pencil` | 编辑 | 可编辑字段旁 |
| `trash-2` | 删除 | 危险操作按钮 |
| `copy` | 复制 | 路径复制、代码复制 |
| `refresh-cw` | 刷新 | 刷新状态按钮 |
| `download` | 下载 | 日志下载、导出 |
| `upload` | 上传 | 文件上传入口 |
| `search` | 搜索触发 | 搜索按钮 |
| `filter` | 过滤 | 日志过滤器 |
| `more-horizontal/vertical` | 更多操作 | 行操作菜单 |
| `external-link` | 外部链接 | 外部跳转标识 |
| `maximize/minimize` | 最大化/最小化 | 窗口控制 |
| `log-out` | 退出登录 | 菜单栏退出 |

#### 状态类 (8 个)

| 图标名 | 用途 | 出现位置 |
|--------|------|----------|
| `check-circle` | 成功/已确认 | 状态 Badge、成功提示 |
| `x-circle` | 错误/失败 | 错误状态 Badge |
| `alert-triangle` | 警告 | Warning Banner |
| `alert-circle` | 信息/注意 | Info 提示 |
| `info` | 信息 | Tooltip、Info Card |
| `loader` | 加载中 | Spinner、Skeleton 替代 |
| `clock` | 时间/历史 | 时间戳、历史记录 |
| `zap` | 快速/即时 | 快捷操作标记 |

#### 工作区专属 (10 个)

| 图标名 | 用途 | 出现位置 |
|--------|------|----------|
| `git-branch` | Git 分支 | Git 状态面板 |
| `git-commit` | Git 提交 | Git 状态面板 |
| `git-pull-request` | PR/MR | Git 状态面板 |
| `git-merge` | 合并 | Git 状态面板 |
| `terminal` | 终端/Worker | Worker 监控 |
| `database` | 数据库/存储 | 数据管理区域 |
| `layers` | 索引/层级 | 索引服务页 |
| `hard-drive` | 磁盘/存储 | 存储信息展示 |
| `shield-check` | 安全/权限 | 安全模式标识 |
| `save` | 保存/检查点 | 创建检查点按钮 |

#### 审批/任务专属 (6 个)

| 图标名 | 用途 | 出现位置 |
|--------|------|----------|
| `user-check` | 已批准 | 审批通过状态 |
| `user-x` | 已拒绝 | 审批拒绝状态 |
| `gavel` | 审批/裁决 | 审批中心入口 |
| `hourglass` | 等待/超时 | 待审批/超时状态 |
| `flag` | 标记/优先级 | 高优先级任务标记 |
| `shield-alert` | 高风险 | 风险等级指示 |

## 4. SVG 编码规范

### 4.1 标准 SVG 模板

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- 图标路径 -->
</svg>
```

### 4.2 强制属性

| 属性 | 值 | 说明 |
|------|-----|------|
| `xmlns` | `http://www.w3.org/2000/svg` | SVG 命名空间 |
| `width` | `24` | 默认宽度（由 CSS 控制实际渲染大小） |
| `height` | `24` | 默认高度 |
| `viewBox` | `0 0 24 24` | 统一 24×24 画布 |
| `fill` | `none` | 默认无填充（outline 风格） |
| `stroke` | `currentColor` | **关键**: 使用当前文字颜色，随主题变色 |
| `stroke-width` | `2` | 统一线宽 |
| `stroke-linecap` | `round` | 圆角线端 |
| `stroke-linejoin` | `round` | 圆角连接 |

### 4.3 特殊变体

#### Filled 变体（实心版）

部分场景需要实心图标（如 Logo、空状态插图），使用 `fill="currentColor"` 并移除 stroke：

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
</svg>
```

#### 双色图标（极少数情况）

仅用于品牌 Logo 或特殊场景，使用 CSS 变量引用固定颜色：

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path fill="var(--color-primary)" d="..."/>
  <path fill="var(--color-accent)" d="..."/>
</svg>
```

## 5. 图标主题适配机制

### 5.1 currentColor 自动适配

所有标准 outline 图标使用 `stroke="currentColor"`：

```css
/* Light 模式: 图标颜色跟随父元素文字颜色 */
.icon { color: var(--color-text-secondary); }

/* Dark 模式: 自动切换 */
[data-theme*="-dark"] .icon {
  color: var(--color-text-secondary); /* 自动变为浅色 */
}

/* Primary 图标 */
.icon-primary { color: var(--color-primary); }

/* Danger 图标 */
.icon-danger { color: var(--color-danger); }
```

### 5.2 图标颜色角色映射

| 颜色角色 | CSS 类 | 使用场景 |
|----------|--------|----------|
| Default | `.icon` 或无 class | 默认跟随文字色 |
| Primary | `.icon-primary` | 主要操作图标 |
| Muted | `.icon-muted` | 次要/禁用图标 |
| Success | `.icon-success` | 成功状态图标 |
| Warning | `.icon-warning` | 警告状态图标 |
| Danger | `.icon-danger` | 危险/错误图标 |
| Inverse | `.icon-inverse` | 彩色背景上的反色图标 |

### 5.3 图标状态变化

| 状态 | 颜色处理 | 示例 |
|------|----------|------|
| Default | `color: var(--color-text-secondary)` | 正常显示 |
| Hover | `color: var(--color-text-primary)` | 鼠标悬停加深 |
| Active/Pressed | `color: var(--color-primary)` | 点击后变色 |
| Disabled | `color: var(--color-text-muted); opacity: 0.5` | 禁用态淡化 |
| Loading | `animation: spin 1s linear infinite` | 旋转动画 |

## 6. 图标组件 API 设计

```typescript
interface IconProps {
  /** 图标名称（对应文件名，不含扩展名） */
  name: string;
  
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
  
  /** 颜色角色 */
  color?: 'default' | 'primary' | 'muted' | 'success' | 'warning' | 'danger' | 'inverse';
  
  /** 是否旋转（loading 态） */
  spinning?: boolean;
  
  /** 自定义 className */
  className?: string;
  
  /** 无障碍标签（纯图标按钮必填） */
  label?: string;
  
  /** ARIA hidden（装饰性图标） */
  decorative?: boolean;
}
```

### 使用示例

```tsx
// 基础用法
<Icon name="folder" size="lg" />

// 带颜色的操作图标
<Icon name="trash-2" size="sm" color="danger" />

// 按钮内的图标
<Button>
  <Icon name="plus" size="sm" />
  新建工作区
</Button>

// Loading 状态
<Icon name="loader" size="md" spinning label="正在加载..." />

// 装饰性图标（屏幕阅读器不可见）
<Icon name="star" size="xl" decorative />
```

## 7. 图标搜索与管理

### 7.1 搜索接口设计

```typescript
interface IconRegistry {
  /** 按名称模糊搜索 */
  search(query: string): IconMeta[];
  
  /** 按分类获取列表 */
  getByCategory(category: IconCategory): IconMeta[];
  
  /** 获取全部图标清单 */
  listAll(): IconMeta[];
  
  /** 获取图标元数据 */
  getMeta(name: string): IconMeta | undefined;
}

interface IconMeta {
  name: string;           // kebab-case 名称
  category: IconCategory; // 分类
  tags: string[];         // 搜索标签
  description: string;    // 中文描述
  variants?: string[];    // 可用变体 (filled, duotone 等)
}

type IconCategory = 
  | 'navigation' 
  | 'action' 
  | 'file' 
  | 'status' 
  | 'ui' 
  | 'workspace' 
  | 'task'
  | 'brand';
```

### 7.2 图标管理工具（开发者模式）

在设置 > 开发者选项中提供：

| 元素 | 类型 | 说明 |
|------|------|------|
| 图标搜索框 | Input | 输入关键词搜索图标 |
| 分类筛选 | TabGroup | 按类别过滤 |
| 图标网格 | Grid | 展示所有匹配图标及名称 |
| 点击复制 | Action | 点击图标复制 `<Icon name="xxx" />` 代码 |
| 使用统计 | Stat | 显示各图标在项目中的使用次数 |
| 未使用检测 | Report | 列出从未被引用的图标（可清理） |

## 8. 图标库扩展指南

### 8.1 添加新图标流程

1. 从 [Lucide Icons](https://lucide.dev) 或自定义源获取 SVG
2. 按编码规范标准化（viewBox、stroke、currentColor 等）
3. 放入对应分类目录
4. 在 `icon-registry.ts` 中注册元数据
5. 更新本规范文档的必需图标清单（如适用）

### 8.2 自定义图标要求

如需 Lucide 库之外的图标：

| 要求 | 说明 |
|------|------|
| 风格一致 | 保持 2px stroke-width、round cap/join |
| 尺寸统一 | 24×24 viewBox |
| 简洁性 | 单一路径优先，避免过多子元素 |
| 性能 | 路径点数量 < 100（复杂图标考虑简化） |
| 测试 | 在 5 种配色 × 2 种主题下验证可见性 |
