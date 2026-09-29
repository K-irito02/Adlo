import type { CSSProperties, RefObject } from 'react';
import { IconClose } from '../../icons';
import { useTCopy } from '@i18n/useTCopy';

export interface SettingsSearchHistoryCardProps {
  /** 历史记录（最近在前），由 store 保证非空且已去重、已截断。 */
  items: string[];
  /** 相对 `.adl-settings-panel__header` 左边距（px）：卡片与「搜索设置输入框」左对齐。 */
  left: number;
  /** 卡片根节点引用：面板据此判定「点击是否发生在卡片内」（外部点击即收起）。 */
  cardRef: RefObject<HTMLDivElement | null>;
  /** 悬停某条记录（移出卡片传 null）：面板据此把记录预览进输入框。 */
  onHoverItem: (value: string | null) => void;
  /** 点击某条记录：以该串重新发起搜索。 */
  onPick: (value: string) => void;
  /** 点击关闭图标：仅收起卡片，不删除历史。 */
  onClose: () => void;
}

/**
 * 设置面板「搜索历史」卡片（自建，替代 WebView2/Edge 的原生自动填充下拉）。
 *
 * 设计约束（来自需求）：
 * - 标题文案走 i18n（`settingsSearchHistory`），不硬编码；
 * - 指向「搜索设置输入框」的小箭头与条目字号都收敛到与面板一致的紧凑尺度；
 * - 右上角关闭键与项目既有对话框一致：20×20 命中区、小图标、悬停灰底；
 * - 每条记录 `title` 只放记录全文本身 —— 记录过长时卡片内会省略号截断，靠 title 看全文；
 * - 悬停条目由面板把记录预览进输入框（选中态只包住文字，不向右延伸），故本组件
 *   只上报悬停目标，不自行改写输入框。
 *
 * 定位：绝对定位挂在面板头部（`.adl-settings-panel__header`，`position: relative`），
 * 宽度上限按「头部宽 − 卡片左边距 − 内边距」夹紧，窄面板下不会溢出到窗口外。
 */
export function SettingsSearchHistoryCard({
  items,
  left,
  cardRef,
  onHoverItem,
  onPick,
  onClose,
}: SettingsSearchHistoryCardProps) {
  const { t } = useTCopy();

  return (
    <div
      ref={cardRef}
      className="adl-settings-search-history"
      style={{ '--adl-history-left': `${left}px` } as CSSProperties}
      role="group"
      aria-label={t.settingsSearchHistory}
      // 指针离开整张卡片即撤销预览（条目级 onMouseEnter 已负责置入）。
      onMouseLeave={() => onHoverItem(null)}
    >
      <div className="adl-settings-search-history__header">
        <span className="adl-settings-search-history__title">{t.settingsSearchHistory}</span>
        <button
          type="button"
          className="adl-settings-search-history__close"
          aria-label={t.close}
          title={t.close}
          onClick={onClose}
        >
          <IconClose size={12} decorative />
        </button>
      </div>
      <ul className="adl-settings-search-history__list">
        {items.map((item) => (
          <li key={item} className="adl-settings-search-history__list-item">
            <button
              type="button"
              className="adl-settings-search-history__item"
              // 只放记录文本本身：记录过长时卡片内省略号截断，悬停可看全文。
              title={item}
              onMouseEnter={() => onHoverItem(item)}
              onClick={() => onPick(item)}
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
