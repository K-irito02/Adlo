import React from 'react';
import { useTCopy } from '@i18n/useTCopy';

/**
 * 「忽略文件设置」详细说明卡片（挂载于标题右侧说明图标）。
 *
 * 版式复用 `adl-help-card`（与检索上限说明卡同一套），内容面向非专业用户：
 * 讲清手动勾选、`.gitignore` 是什么、两者叠加与保存时机。
 */
export const SearchIgnoreHelpCard = React.memo(function SearchIgnoreHelpCard() {
  const { t } = useTCopy();
  const sections: { title: string; body: string }[] = [
    { title: t.searchIgnoreHelpManualTitle, body: t.searchIgnoreHelpManualBody },
    { title: t.searchIgnoreHelpGitignoreTitle, body: t.searchIgnoreHelpGitignoreBody },
    { title: t.searchIgnoreHelpCombineTitle, body: t.searchIgnoreHelpCombineBody },
    { title: t.searchIgnoreHelpSaveTitle, body: t.searchIgnoreHelpSaveBody },
  ];
  return (
    <div className="adl-help-card">
      <div className="adl-help-card__title">{t.searchSettingsIgnoreHintTitle}</div>
      {sections.map((section) => (
        <div key={section.title} className="adl-help-card__section">
          <div className="adl-help-card__section-title">{section.title}</div>
          <div className="adl-help-card__section-body">{section.body}</div>
        </div>
      ))}
    </div>
  );
});
