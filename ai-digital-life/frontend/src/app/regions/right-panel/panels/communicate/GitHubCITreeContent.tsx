import React from 'react';
import { GitHubTree } from '@features/github-tree/GitHubTree';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import type { SectionCallbacks } from '@features/github-tree/GitHubCategorySection';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { GitWorkspaceCiConfig, GitHubCiFolderState } from '@stores/slices/githubRepoSlice';
import type { CopyDict } from '@app/i18n/types';

interface GitHubCITreeContentProps {
  showHelp: boolean;
  handleHelpNav: (sectionId: string) => void;
  copy: CopyDict;
  workspaces: RecentWorkspaceEntry[];
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>;
  gitHubCiFolders: GitHubCiFolderState[];
  gitHubTreeExpanded: Record<string, boolean>;
  selectedGitHubTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  sectionCallbacks: SectionCallbacks;
  gitHubViewMode: 'tree' | 'list';
}

export function GitHubCITreeContent({
  showHelp,
  handleHelpNav,
  copy,
  workspaces,
  gitHubWorkspaceConfigs,
  gitHubCiFolders,
  gitHubTreeExpanded,
  selectedGitHubTreePath,
  onSelectTreePath,
  onTogglePath,
  sectionCallbacks,
  gitHubViewMode,
}: GitHubCITreeContentProps) {
  const labels = {
    ciWorkspaceCategory: copy.ciWorkspaceCategory,
    userFolderCategory: copy.ciUserFolderCategory,
    ciOverview: copy.ciOverview,
    ciWorkflows: copy.ciWorkflows,
    ciJobs: copy.ciJobs,
    ciLogs: copy.ciLogs,
  };

  if (showHelp) {
    return (
      <CustomScrollArea
        shellClassName="adl-multitree adl-multitree--github"
        scrollClassName="adl-multitree-scroll"
        scrollbarClassName="adl-multitree-scrollbar"
        thumbClassName="adl-multitree-scrollbar__thumb"
      >
        <div className="adl-github-category">
          <div
            className="adl-github-category__label"
            style={{ cursor: 'pointer' }}
            onClick={() => handleHelpNav('gh-help-layout')}
          >
            <span className="adl-github-category__label-text">{copy.ciHelpLayoutTitle}</span>
          </div>
          <div className="adl-github-category__entries">
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-layout-navigator')}
            >
              {copy.ciHelpLayoutNavigator}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-layout-primary')}
            >
              {copy.ciHelpLayoutPrimary}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-layout-toolbar')}
            >
              {copy.ciHelpLayoutToolbar}
            </div>
          </div>
        </div>
        <div className="adl-github-category">
          <div
            className="adl-github-category__label"
            style={{ cursor: 'pointer' }}
            onClick={() => handleHelpNav('gh-help-basic')}
          >
            <span className="adl-github-category__label-text">{copy.ciHelpBasicTitle}</span>
          </div>
          <div className="adl-github-category__entries">
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-how-to-config')}
            >
              {copy.ciHelpHowToConfig}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-status-colors')}
            >
              {copy.ciHelpStatusColors}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-view-logs')}
            >
              {copy.ciHelpViewLogs}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-basic-autorefresh')}
            >
              {copy.ciHelpBasicAutoRefresh}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-multi-workspace')}
            >
              {copy.ciHelpMultiWorkspace}
            </div>
          </div>
        </div>
        <div className="adl-github-category">
          <div
            className="adl-github-category__label"
            style={{ cursor: 'pointer' }}
            onClick={() => handleHelpNav('gh-help-concepts')}
          >
            <span className="adl-github-category__label-text">{copy.ciHelpConceptsTitle}</span>
          </div>
          <div className="adl-github-category__entries">
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-concept-workflow')}
            >
              {copy.ciHelpConceptWorkflowLabel}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-concept-job')}
            >
              {copy.ciHelpConceptJobLabel}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-concept-step')}
            >
              {copy.ciHelpConceptStepLabel}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-concept-run')}
            >
              {copy.ciHelpConceptRunLabel}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-concept-conclusion')}
            >
              {copy.ciHelpConceptConclusion}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-concept-status')}
            >
              {copy.ciHelpConceptStatus}
            </div>
          </div>
        </div>
        <div className="adl-github-category">
          <div
            className="adl-github-category__label"
            style={{ cursor: 'pointer' }}
            onClick={() => handleHelpNav('gh-help-troubleshooting')}
          >
            <span className="adl-github-category__label-text">
              {copy.ciHelpTroubleshootingTitle}
            </span>
          </div>
          <div className="adl-github-category__entries">
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-trouble-noruns')}
            >
              {copy.ciHelpTroubleNoRuns}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-trace-ratelimit')}
            >
              {copy.ciHelpTroubleRateLimit}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-trouble-autorefresh')}
            >
              {copy.ciHelpTroubleNoAutoRefresh}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-trouble-incomplete')}
            >
              {copy.ciHelpTroubleIncompleteInfo}
            </div>
          </div>
        </div>
        <div className="adl-github-category">
          <div
            className="adl-github-category__label"
            style={{ cursor: 'pointer' }}
            onClick={() => handleHelpNav('gh-help-token')}
          >
            <span className="adl-github-category__label-text">{copy.ciHelpTokenTitle}</span>
          </div>
          <div className="adl-github-category__entries">
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-token-why')}
            >
              {copy.ciHelpTokenWhyNeed}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-token-scopes')}
            >
              {copy.ciHelpTokenScopes}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-token-steps')}
            >
              {copy.ciHelpTokenSteps}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-token-old')}
            >
              {copy.ciHelpTokenOldMethod}
            </div>
            <div
              className="adl-github-entry__leaf"
              onClick={() => handleHelpNav('gh-help-token-security')}
            >
              {copy.ciHelpTokenSecurity}
            </div>
          </div>
        </div>
      </CustomScrollArea>
    );
  }

  return (
    <GitHubTree
      workspaces={workspaces}
      gitHubWorkspaceConfigs={gitHubWorkspaceConfigs}
      gitHubCiFolders={gitHubCiFolders}
      gitHubTreeExpanded={gitHubTreeExpanded}
      selectedTreePath={selectedGitHubTreePath}
      onSelectTreePath={onSelectTreePath}
      onTogglePath={onTogglePath}
      callbacks={sectionCallbacks}
      labels={labels}
      gitHubViewMode={gitHubViewMode}
    />
  );
}
