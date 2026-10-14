import type { CSSProperties, RefObject } from 'react';
import { IconClose, IconTrash } from '../../icons';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '../../i18n/formatT';
import { useRevealScrollbar } from '../../hooks/useRevealScrollbar';
import { RevealScrollbar } from '../RevealScrollbar';

/** 卡片的 DOM id：供输入框 `aria-controls` 关联（浮层与触发器的可访问性绑定）。 */
export const SEARCH_HISTORY_CARD_ID = 'adl-settings-search-history';

export interface SettingsSearchHistoryCardProps {
  /** 历史记录（最近在前）：写入侧去重置顶 + 截断，读盘侧同样规整（见 `readSettingsSearchHistory`）。 */
  items: string[];
  /** 相对 `.adl-settings-panel__header` 左边距（px）：卡片与「搜索设置输入框」左对齐。 */
  left: number;
  /** 卡片根节点引用：面板据此判定「点击是否发生在卡片内」（外部点击即收起）。 */
  cardRef: RefObject<HTMLDivElement | null>;
  /** 悬停/聚焦某条记录（移出卡片传 null）：面板据此把记录预览进输入框。 */
  onHoverItem: (value: string | null) => void;
  /** 点击某条记录：以该串重新发起搜索。 */
  onPick: (value: string) => void;
  /** 一键清空全部搜索历史。 */
  onClearAll: () => void;
  /** 删除单条搜索历史。 */
  onRemoveItem: (value: string) => void;
  /** 收起卡片：仅收起，不删除历史、不清空查询。 */
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
 * - 悬停/聚焦条目由面板把记录预览进输入框（选中态只包住文字，不向右延伸），故本组件
 *   只上报悬停目标，不自行改写输入框。
 *
 * 交互细节（两处易踩）：
 * - 根节点 `onMouseDown` 阻止默认：卡片内的标题/留白/滚动条都**不可聚焦**，浏览器在
 *   mousedown 时会先清掉输入框焦点 → 触发面板的失焦收起（整个搜索栏一起消失）。
 *   阻止默认即保住输入框焦点，条目按钮的 click 不受影响。
 * - 根节点处理 Escape：焦点 Tab 进卡片后，输入框上的 Esc 处理器不再收到事件，
 *   故此处兜住「Esc 收起卡片」并交还焦点（一次 Esc 只收卡片，不清查询 —— 与面板输入框
 *   上的 Esc 语义分工明确）。
 *
 * 定位：绝对定位挂在面板头部（`.adl-settings-panel__header`，`position: relative`），
 * 宽度上限按「头部宽 − 卡片左边距 − 内边距」夹紧，窄面板下不会溢出到窗口外。
 * 层级由头部承担（头部 `z-index` 高于导航拖拽线），卡片自身不再声明 z-index。
 */
export function SettingsSearchHistoryCard({
  items,
  left,
  cardRef,
  onHoverItem,
  onPick,
  onClearAll,
  onRemoveItem,
  onClose,
}: SettingsSearchHistoryCardProps) {
  const { t } = useTCopy();
  // 列表滚动条沿用同面板下拉家族的 overlay 口径（原生细条隐藏 + RevealScrollbar 悬停显现）：
  // 同一面板里两种滚动观感是可见的不一致。deps 只放进会影响可滚性的量。
  const scrollbar = useRevealScrollbar([items.length]);

  return (
    <div
      ref={cardRef}
      id={SEARCH_HISTORY_CARD_ID}
      className="adl-settings-search-history"
      style={{ '--adl-history-left': `${left}px` } as CSSProperties}
      role="group"
      aria-label={t.settingsSearchHistory}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') {
          return;
        }
        // 有意阻断继续冒泡：焦点在卡片内时，document 级的 Esc 监听（如未来的全局
        // 浮层管理器）不应再收到该事件 —— 「一次 Esc 只收卡片」由这里独占。
        event.stopPropagation();
        onClose();
      }}
      // 焦点离开整张卡片（Tab 走到底）也要撤销预览：否则输入框会残留上一条预览。
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        onHoverItem(null);
      }}
      {...scrollbar.hoverProps}
      // 指针离开整张卡片即撤销预览（条目级 onMouseEnter/onFocus 已负责置入）。
      // 后写获胜会覆盖 hook 的 onMouseLeave（显现状态卡死），故合并调用。
      onMouseLeave={() => {
        scrollbar.hoverProps.onMouseLeave();
        onHoverItem(null);
      }}
    >
      <div className="adl-settings-search-history__header">
        <span className="adl-settings-search-history__title">{t.settingsSearchHistory}</span>
        <span className="adl-settings-search-history__header-actions">
          <button type="button" className="adl-settings-search-history__clear" onClick={onClearAll}>
            {t.settingsSearchHistoryClear}
          </button>
          <button
            type="button"
            className="adl-settings-search-history__close"
            aria-label={t.close}
            title={t.close}
            onClick={onClose}
          >
            <IconClose size={12} decorative />
          </button>
        </span>
      </div>
      {/* `adl-reveal-scrollbar-host`：共享的滚动条定位宿主（position: relative），与全项目口径一致。 */}
      <div className="adl-settings-search-history__scroll-host adl-reveal-scrollbar-host">
        <ul
          className="adl-settings-search-history__list adl-reveal-scroll"
          // 双跳断言是当前类型约束下的必要形态：hook 与 `RevealScrollbar` 控制器类型
          // 锚定 `HTMLDivElement`（`RefObject` 对元素类型不变），泛型化会波及全部消费方，
          // 收益不成比例 —— 运行时 ref 只要求 `.current` 可写，挂 ul 完全成立。
          ref={scrollbar.scrollRef as unknown as RefObject<HTMLUListElement>}
        >
          {items.map((item) => (
            <li key={item} className="adl-settings-search-history__row">
              <button
                type="button"
                className="adl-settings-search-history__item"
                // 只放记录文本本身：记录过长时卡片内省略号截断，悬停可看全文。
                title={item}
                onMouseEnter={() => onHoverItem(item)}
                // 键盘 Tab 浏览条目时同样给预览（与悬停同源，故共用同一回调）。
                onFocus={() => onHoverItem(item)}
                onClick={() => onPick(item)}
              >
                {item}
              </button>
              <button
                type="button"
                className="adl-settings-search-history__remove"
                title={t.settingsSearchHistoryRemoveTitle}
                aria-label={formatT(t, 'settingsSearchHistoryRemoveLabel', { name: item })}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveItem(item);
                }}
              >
                <IconTrash size={12} decorative />
              </button>
            </li>
          ))}
        </ul>
        {/* 滚动条轨道以其定位宿主为界：必须与列表同宿主，否则轨道会撑到整张卡片
            （含历史标题与关闭键那一行），滑块位置整体偏移。 */}
        <RevealScrollbar controller={scrollbar} />
      </div>
    </div>
  );
}
