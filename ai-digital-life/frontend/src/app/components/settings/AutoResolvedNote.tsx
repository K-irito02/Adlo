import type { ReactNode } from 'react';

/**
 * 「自动检测」设置的**真实状态**提示行（挂在设置项标题下方的描述小字区）。
 *
 * 下拉保持用户选择的「自动检测」，这里补充背后实际生效的目标：选中的下载源、
 * 解析到的版本来源、回退后的直连等。颜色与 DSH 组提示小字同源（压暗蓝，
 * 用户已批准），刻意不用警示色——它是状态说明，不是错误。
 *
 * 由调用方在「真实生效状态已知、且与下拉选择需要区分」时渲染（自动检测模式，
 * 或偏好已钉住但外部实例正在运行）；未知/首帧不占位。
 */
export function AutoResolvedNote({ children }: { children: ReactNode }) {
  return (
    <small className="adl-settings-auto-note" data-settings-auto-note="true">
      {children}
    </small>
  );
}
