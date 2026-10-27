# 按钮加载占位覆盖（Button Loading Overlay）

操作按钮进入加载态时，文案隐藏占位保证按钮尺寸不变，圆圈/打勾/打叉以绝对定位覆盖层在按钮内部水平垂直居中。

## 何时用

按钮点击后有异步过程（保存、检测、安装），且需要防抖动（尺寸不变）+ 结果回显时。

## 用法

- 按钮加 `adl-btn-loading`（`position: relative`）。
- 文案包 `adl-btn-loading__text`（`visibility: hidden` 占位；仍参与可访问名称计算，单测可按原名定位）。
- 图标放 `adl-btn-loading__spinner` 覆盖层（`absolute inset: 0` 居中，`pointer-events: none`）。
- 成功/失败色：覆盖层追加 `adl-btn-loading__spinner--success` / `--error`（走 `--success` / `--danger` token）。
- React 侧用共享三态机，见 `action-flash-triad.md`。

定义见 `frontend/src/styles/components/settings.css`。

## 反例

- 禁止把文案替换成圈（按钮塌缩抖动）。
- 下拉 trigger 同理（文案 + 箭头一起隐藏占位），不要把圈放按钮外部。
