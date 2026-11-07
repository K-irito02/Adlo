import type { ReactNode } from 'react';
import { IconFolderPlus } from '@icons';

export interface AddWorkspaceHintProps {
  /** 前半句，例如「点击顶部标题栏」。 */
  prefix: string;
  /** 后半句，例如「按钮添加工作区」。 */
  suffix: string;
  /** 文案中间的图标；缺省为标题栏「添加工作区」同款图标。 */
  icon?: ReactNode;
}

/**
 * 空态里的「前缀 + 真实图标 + 后缀」提示：把操作入口的图标嵌进文案中间，
 * 让用户一眼对应到实际按钮。字号/颜色由调用方容器决定：文件/变更面板走
 * `.adl-empty-hint` 基线，浏览器分类走 `.adl-browser-category__empty`。
 */
export function AddWorkspaceHint({ prefix, suffix, icon }: AddWorkspaceHintProps) {
  return (
    <span className="adl-empty-hint__inline">
      <span>{prefix}</span>
      <span className="adl-empty-hint__icon" aria-hidden="true">
        {icon ?? <IconFolderPlus size={14} decorative />}
      </span>
      <span>{suffix}</span>
    </span>
  );
}
