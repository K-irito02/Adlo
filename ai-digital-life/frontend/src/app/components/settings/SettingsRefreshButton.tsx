import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { IconRefreshArc } from '@icons';

/** 行级刷新状态：由各设置组维护（是否在途、点击后做什么）。 */
export interface SettingsRowRefreshState {
  /** 无障碍名后缀（完整名为「刷新：{label}」）。 */
  label: string;
  /** 本行刷新在途：按钮转圈、控件区由调用方负责扫光。 */
  spinning: boolean;
  onRefresh: () => void;
}

interface SettingsRefreshButtonProps {
  label: string;
  spinning: boolean;
  disabled?: boolean;
  /** 块标题右侧的刷新全部按钮：尺寸略大。 */
  block?: boolean;
  onRefresh: () => void;
}

/**
 * 设置项 / 块头的「刷新」图标按钮。
 *
 * - `title` 统一「刷新」（用户要求）；`aria-label` 带目标名，避免同页多个「刷新」无法区分。
 * - 行内版本按钮放在 {@link SettingsRowRefresh} 槽里，由行 `:hover` / `:focus-within` 显现。
 * - 触屏（`hover: none`）由 CSS 常显，不依赖悬停。
 */
export function SettingsRefreshButton({
  label,
  spinning,
  disabled,
  block = false,
  onRefresh,
}: SettingsRefreshButtonProps) {
  const { t } = useTCopy();
  return (
    <button
      type="button"
      className={`adl-settings-refresh${block ? ' adl-settings-refresh--block' : ''}`}
      title={t.refresh}
      aria-label={formatT(t, 'settingsRefreshAria', { target: label })}
      aria-busy={spinning}
      aria-disabled={disabled === true || spinning}
      disabled={disabled === true}
      onClick={() => {
        if (disabled === true || spinning) {
          return;
        }
        onRefresh();
      }}
    >
      <IconRefreshArc
        size={block ? 16 : 14}
        decorative
        className={spinning ? 'adl-spin' : undefined}
      />
    </button>
  );
}

/**
 * 行内刷新槽：静止宽度 0（不占常驻布局），悬停/聚焦后展开为 22px。
 *
 * 环境行的调用方把槽放在状态徽章之后，保证标题与徽章之间没有预留空隙。
 */
export function SettingsRowRefresh({
  refresh,
  disabled,
}: {
  refresh?: SettingsRowRefreshState | null;
  disabled?: boolean;
}) {
  if (!refresh) {
    return null;
  }
  return (
    <span className="adl-settings-row__refresh">
      <SettingsRefreshButton
        label={refresh.label}
        spinning={refresh.spinning}
        disabled={disabled}
        onRefresh={refresh.onRefresh}
      />
    </span>
  );
}
