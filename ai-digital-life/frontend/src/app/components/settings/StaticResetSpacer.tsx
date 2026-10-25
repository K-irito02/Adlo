/**
 * 无恢复按钮的块头占位图标：与带恢复按钮的块头左对齐（仅装饰、不可交互）。
 *
 * 供「块头 + 卡片」布局的设置组共用（DSH / 网络 / 环境），避免每个组各抄一份。
 */
import { IconResetDefaults } from '../../icons';

export function StaticResetSpacer() {
  return (
    <span className="adl-settings-row__reset adl-settings-row__reset--static" aria-hidden="true">
      <IconResetDefaults size={14} decorative />
    </span>
  );
}
