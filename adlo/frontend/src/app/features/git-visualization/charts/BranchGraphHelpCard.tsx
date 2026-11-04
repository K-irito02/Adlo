import React from 'react';
import { useTCopy } from '@i18n/useTCopy';

/**
 * Comprehensive guide card for the Branch Graph visualization — lanes, commit
 * nodes, branch labels, filtering, progress/merge and the commit table.
 * Rendered inside a HintCardTrigger (hover or click on the help icon next to
 * the "分支图谱" title). Uses the shared help-card layout (`.adl-help-card*`).
 * All copy is i18n-driven.
 */
export const BranchGraphHelpCard = React.memo(function BranchGraphHelpCard() {
  const { t } = useTCopy();
  const sections = [
    { title: t.gitVisBranchGraphHelpLanesTitle, body: t.gitVisBranchGraphHelpLanes },
    { title: t.gitVisBranchGraphHelpNodesTitle, body: t.gitVisBranchGraphHelpNodes },
    { title: t.gitVisBranchGraphHelpLabelsTitle, body: t.gitVisBranchGraphHelpLabels },
    { title: t.gitVisBranchGraphHelpFilterTitle, body: t.gitVisBranchGraphHelpFilter },
    { title: t.gitVisBranchGraphHelpProgressTitle, body: t.gitVisBranchGraphHelpProgress },
    { title: t.gitVisBranchGraphHelpTableTitle, body: t.gitVisBranchGraphHelpTable },
  ];
  return (
    <div className="adl-help-card">
      <div className="adl-help-card__title">{t.gitVisBranchGraphHelpTitle}</div>
      {sections.map((section) => (
        <div key={section.title} className="adl-help-card__section">
          <div className="adl-help-card__section-title">{section.title}</div>
          <div className="adl-help-card__section-body">{section.body}</div>
        </div>
      ))}
    </div>
  );
});
