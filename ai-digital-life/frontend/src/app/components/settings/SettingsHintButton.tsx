import { HintCardTrigger } from '../HintCard';
import { IconCircleHelp } from '../../icons';

/**
 * 设置组行内「?」提示说明图标按钮：悬停（或点击）打开帮助卡。
 *
 * 供各设置块的 {@link HintCardTrigger} 触发按钮复用——DSH 组下载源/代理/测试连接/
 * 版本管理各行统一使用，避免重复内联同一段标记。
 *
 * 按钮 `tabIndex={-1}`：与设置组既有约定一致（帮助信息经鼠标悬停/点击展开，
 * 不进入 Tab 序列）。
 */
export function SettingsHintButton({ content }: { content: string }) {
  return (
    <HintCardTrigger content={content}>
      <button
        type="button"
        className="adl-icon-button adl-icon-button--info"
        tabIndex={-1}
        aria-label={content}
      >
        <IconCircleHelp size={16} />
      </button>
    </HintCardTrigger>
  );
}
