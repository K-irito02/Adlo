import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  SEARCH_HARD_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_PAGE_SIZE_MIN,
} from '../../../shared/ipc/searchWindow';

/**
 * 「限制设置」详细说明卡片（挂载于标题右侧说明图标）。
 *
 * 版式复用 `adl-help-card`，重点讲清：两个数字是什么、填小/填大/填错了
 * 分别会怎样（保存时钳制到合法区间、非法输入恢复原值）。
 */
export const SearchLimitsHelpCard = React.memo(function SearchLimitsHelpCard() {
  const { t, formatT } = useTCopy();
  const vars = {
    pageMin: SEARCH_PAGE_SIZE_MIN,
    pageMax: SEARCH_PAGE_SIZE_MAX,
    maxMin: SEARCH_PAGE_SIZE,
    maxHard: SEARCH_HARD_MAX_RESULTS,
  };
  const sections: { title: string; body: string }[] = [
    { title: t.searchLimitsHelpNumbersTitle, body: t.searchLimitsHelpNumbersBody },
    {
      title: t.searchLimitsHelpTooSmallTitle,
      body: formatT(t, 'searchLimitsHelpTooSmallBody', vars),
    },
    {
      title: t.searchLimitsHelpTooBigTitle,
      body: formatT(t, 'searchLimitsHelpTooBigBody', vars),
    },
    { title: t.searchLimitsHelpInvalidTitle, body: t.searchLimitsHelpInvalidBody },
    { title: t.searchLimitsHelpSaveTitle, body: t.searchLimitsHelpSaveBody },
  ];
  return (
    <div className="adl-help-card">
      <div className="adl-help-card__title">{t.searchSettingsLimitsHintTitle}</div>
      {sections.map((section) => (
        <div key={section.title} className="adl-help-card__section">
          <div className="adl-help-card__section-title">{section.title}</div>
          <div className="adl-help-card__section-body">{section.body}</div>
        </div>
      ))}
    </div>
  );
});
