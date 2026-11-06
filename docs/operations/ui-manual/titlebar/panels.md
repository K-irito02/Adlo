# 面板控制

> 标题栏的面板控制按钮组，用于切换左侧边栏和右侧面板的显示/隐藏。

## 按钮列表

| 按钮 | 说明 | 文档 |
|------|------|------|
| 切换两侧面板 | 同时切换左右面板 | [切换两侧面板](#切换两侧面板) |
| 切换左侧边栏 | 切换左侧边栏显示/隐藏 | [切换左侧边栏](#切换左侧边栏) |
| 切换右侧面板 | 切换右侧面板显示/隐藏 | [切换右侧面板](#切换右侧面板) |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-titlebar__panel-group` | 面板控制按钮组容器 |
| `.adl-iconstrip` | 按钮条容器 |

---

## 切换两侧面板

> 同时切换左侧边栏和右侧面板的显示/隐藏状态

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="切换两侧面板"]` |
| 2 | CSS | `.adl-titlebar__panel-group button`（双箭头图标：两侧展开时向外、两侧折叠时向内） |

### 前置条件

- [x] 无特殊条件

### 操作

```javascript
await page.click('button[aria-label="切换两侧面板"]');
```

### 状态变化

| 当前状态 | 切换后状态 |
|----------|------------|
| 两侧都展开 | 两侧都折叠 |
| 两侧都折叠 | 两侧都展开 |
| 一侧展开一侧折叠 | 两侧都展开 |

### 预期结果

- 左侧边栏和右侧面板同时切换状态
- `.adl-shell__body` 的类名更新：
  - `is-left-collapsed` - 左侧边栏折叠
  - `is-right-collapsed` - 右侧面板折叠

### 等待条件

```javascript
// 等待状态变化
await page.waitForFunction(() => {
  const body = document.querySelector('.adl-shell__body');
  return body.classList.contains('is-left-collapsed') || body.classList.contains('is-right-collapsed');
});
```

---

## 切换左侧边栏

> 切换左侧边栏的显示/隐藏状态

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="切换左侧边栏"]` |
| 2 | CSS | `.adl-titlebar__panel-group button.adl-iconstrip__button--paneltoggle` (第一个) |

### 前置条件

- [x] 无特殊条件

### 操作

```javascript
await page.click('button[aria-label="切换左侧边栏"]');
```

### 状态变化

| 当前状态 | 切换后状态 |
|----------|------------|
| 展开 | 折叠 |
| 折叠 | 展开 |

### 预期结果

- 左侧边栏状态切换
- `.adl-leftbar` 的类名更新：
  - 无 `adl-leftbar--collapsed` - 展开
  - 有 `adl-leftbar--collapsed` - 折叠
- 按钮 `aria-pressed` 属性更新：
  - `false` - 展开
  - `true` - 折叠

### 等待条件

```javascript
// 等待折叠
await page.waitForFunction(() => {
  return document.querySelector('.adl-leftbar')?.classList.contains('adl-leftbar--collapsed');
});

// 等待展开
await page.waitForFunction(() => {
  return !document.querySelector('.adl-leftbar')?.classList.contains('adl-leftbar--collapsed');
});
```

### 验证状态

```javascript
const isCollapsed = await page.evaluate(() => {
  return document.querySelector('.adl-leftbar')?.classList.contains('adl-leftbar--collapsed');
});
```

---

## 切换右侧面板

> 切换右侧面板的显示/隐藏状态

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="切换右侧面板"]` |
| 2 | CSS | `.adl-titlebar__panel-group button.adl-iconstrip__button--paneltoggle` (第二个) |

### 前置条件

- [x] 无特殊条件

### 操作

```javascript
await page.click('button[aria-label="切换右侧面板"]');
```

### 状态变化

| 当前状态 | 切换后状态 |
|----------|------------|
| 展开 | 折叠 |
| 折叠 | 展开 |

### 预期结果

- 右侧面板状态切换
- `.adl-rightpanel` 的类名更新：
  - 无 `adl-rightpanel--collapsed` - 展开
  - 有 `adl-rightpanel--collapsed` - 折叠
- 按钮 `aria-pressed` 属性更新：
  - `false` - 展开
  - `true` - 折叠

### 等待条件

```javascript
// 等待折叠
await page.waitForFunction(() => {
  return document.querySelector('.adl-rightpanel')?.classList.contains('adl-rightpanel--collapsed');
});

// 等待展开
await page.waitForFunction(() => {
  return !document.querySelector('.adl-rightpanel')?.classList.contains('adl-rightpanel--collapsed');
});
```

### 验证状态

```javascript
const isCollapsed = await page.evaluate(() => {
  return document.querySelector('.adl-rightpanel')?.classList.contains('adl-rightpanel--collapsed');
});
```

## 面板状态组合

| 左侧边栏 | 右侧面板 | `.adl-shell__body` 类名 |
|----------|----------|-------------------------|
| 展开 | 展开 | (无特殊类名) |
| 展开 | 折叠 | `is-right-collapsed` |
| 折叠 | 展开 | `is-left-collapsed` |
| 折叠 | 折叠 | `is-left-collapsed is-right-collapsed` |

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 左侧边栏 | `.adl-leftbar` | 左侧边栏容器 |
| 右侧面板 | `.adl-rightpanel` | 右侧面板容器 |
| Shell Body | `.adl-shell__body` | 主内容区域容器 |
