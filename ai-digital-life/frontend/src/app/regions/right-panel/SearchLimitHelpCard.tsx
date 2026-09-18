import React from 'react';
import { useTCopy } from '@i18n/useTCopy';

/**
 * 「检索结果上限」详细说明卡片。
 *
 * 挂载于 `HintCardTrigger`（悬停或点击提示行右侧的“!”图标即弹出）——
 * 与分支图谱帮助卡同一套模式：共享卡片外壳（`styles/components/hintCard.css`）
 * + 共享内容版式（`.adl-help-card*`），本组件只负责组织 i18n 文案。
 */
export const SearchLimitHelpCard = React.memo(function SearchLimitHelpCard() {
  const { t } = useTCopy();
  const sections: { title: string; body: string }[] = [
    { title: t.searchLimitHelpWhyTitle, body: t.searchLimitHelpWhy },
    { title: t.searchLimitHelpActionsTitle, body: t.searchLimitHelpActions },
    { title: t.searchLimitHelpCeilingTitle, body: t.searchLimitHelpCeiling },
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
