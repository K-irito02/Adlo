import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SEARCH_MAX_RESULTS, SEARCH_PAGE_SIZE } from '../../../shared/ipc/searchWindow';

/**
 * 「检索结果上限」详细说明卡片。
 *
 * 挂载于 `HintCardTrigger`（悬停或点击提示行右侧的“!”图标即弹出）——
 * 与分支图谱帮助卡同一套模式：共享卡片外壳（`styles/components/hintCard.css`）
 * + 共享内容版式（`.adl-help-card*`），本组件只负责组织 i18n 文案。
 *
 * 文案里的两个数量（每页条数、上限）优先取调用方传入的用户自定义值，
 * 缺省回退到 `searchWindow.ts` 的常量，避免常量调整后说明文字与真实行为悄悄漂移。
 */
export const SearchLimitHelpCard = React.memo(function SearchLimitHelpCard({
  page = SEARCH_PAGE_SIZE,
  max = SEARCH_MAX_RESULTS,
}: {
  page?: number;
  max?: number;
}) {
  const { t, formatT } = useTCopy();
  const vars = { page, max };
  const sections: { title: string; body: string }[] = [
    { title: t.searchLimitHelpWhyTitle, body: formatT(t, 'searchLimitHelpWhy', vars) },
    {
      title: t.searchLimitHelpActionsTitle,
      body: formatT(t, 'searchLimitHelpActions', vars),
    },
    {
      title: t.searchLimitHelpCeilingTitle,
      body: formatT(t, 'searchLimitHelpCeiling', vars),
    },
    { title: t.searchLimitHelpScopeTitle, body: t.searchLimitHelpScope },
  ];
  return (
    <div className="adl-help-card">
      <div className="adl-help-card__title">{t.searchLimitHelpTitle}</div>
      {sections.map((section) => (
        <div key={section.title} className="adl-help-card__section">
          <div className="adl-help-card__section-title">{section.title}</div>
          <div className="adl-help-card__section-body">{section.body}</div>
        </div>
      ))}
    </div>
  );
});
