import React from 'react';
import { IconArrowUp, IconMic, IconPlus, IconRefreshCw, IconStopCircle } from '../../icons';
import { ContextBuilderPopover } from '../../components/conversation/ContextBuilderPopover';
import { TooltipSimple } from '../../components/Tooltip';
import { StatusBar } from '../StatusBar';
import { ModelPicker } from '../../components/models/ModelPicker';
import type { ChatMode, ContextChip } from '../../stores/types';
import { useTCopy } from '../../i18n/useTCopy';
import type {
  AgentRunDetail,
  GitSnapshot,
  RecentWorkspaceEntry,
  AppInfo,
  GitBranchSummary,
  ModelGatewayHealthSnapshot,
  WorkspaceGitBranchSwitchInput,
  WorkspaceGitBranchCreateInput,
} from '@ai-digital-life/kernel';

export interface ComposerFooterProps {
  draft: string;
  buttonState: 'send' | 'stop' | 'retry' | 'waiting';
  chatMode: ChatMode;
  contextChips: ContextChip[];
  contextMenuOpen: boolean;
  setContextMenuOpen: (open: boolean) => void;
  setChatMode: (mode: ChatMode) => void;
  addContextChip: (chip: ContextChip) => void;
  removeContextChip: (id: string) => void;
  onSend: () => void;
  onCancelStream: () => void;
  composerEditorRef: React.RefObject<HTMLDivElement | null>;
  composerInputRef: React.RefObject<HTMLDivElement | null>;
  composerCaretRef: React.RefObject<HTMLSpanElement | null>;
  setComposerFocused: (focused: boolean) => void;
  updateCustomCaret: () => void;
  onInput: (event: React.FormEvent<HTMLDivElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  appInfo: AppInfo | undefined;
  modelHealth: ModelGatewayHealthSnapshot | undefined;
  streamingActiveRunId: string | undefined;
  activeRun: AgentRunDetail | undefined;
  workspaceContextMode: 'workspace' | 'global';
  recentWorkspaces: RecentWorkspaceEntry[];
  gitSnapshot: GitSnapshot | undefined;
  gitBranches: GitBranchSummary[];
  handleSelectModel: (providerId: string, modelId?: string) => void;
  actions: {
    openWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
    clearWorkspaceContext: () => Promise<void>;
    pickWorkspaceDirectory: () => Promise<string | undefined>;
    fetchGitBranches: () => Promise<void>;
    switchGitBranch: (input: WorkspaceGitBranchSwitchInput) => Promise<void>;
    createGitBranch: (input: WorkspaceGitBranchCreateInput) => Promise<void>;
  };
}

export function ComposerFooter(props: ComposerFooterProps) {
  const { t } = useTCopy();
  const {
    draft,
    buttonState,
    chatMode,
    contextChips,
    contextMenuOpen,
    setContextMenuOpen,
    setChatMode,
    addContextChip,
    removeContextChip,
    onSend,
    onCancelStream,
    composerEditorRef,
    composerInputRef,
    composerCaretRef,
    setComposerFocused,
    updateCustomCaret,
    onInput,
    onKeyDown,
    appInfo,
    modelHealth,
    streamingActiveRunId,
    activeRun,
    workspaceContextMode,
    recentWorkspaces,
    gitSnapshot,
    gitBranches,
    handleSelectModel,
    actions,
  } = props;

  return (
    <footer className="adl-composer" aria-label="Message composer">
      {contextChips.length ? (
        <div className="adl-composer__chips">
          {contextChips.map((chip) => (
            <span key={chip.id} className={`adl-chip adl-chip--${chip.kind}`}>
              <span>{chip.label}</span>
              <button type="button" onClick={() => removeContextChip(chip.id)} aria-label="Remove">
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="adl-composer__inner">
        <div className="adl-composer__left">
          <TooltipSimple content={t.contextBuilderTrigger} placement="top">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--round"
              onClick={() => setContextMenuOpen(!contextMenuOpen)}
              aria-label={t.contextBuilderTrigger}
            >
              <IconPlus size={16} decorative />
            </button>
          </TooltipSimple>
          <ContextBuilderPopover
            open={contextMenuOpen}
            onClose={() => setContextMenuOpen(false)}
            chatMode={chatMode}
            onSelectMode={setChatMode}
            onAddChip={addContextChip}
          />
        </div>
        <ModelPicker />
        <div className="adl-composer__editor" ref={composerEditorRef}>
          <div
            ref={composerInputRef}
            className="adl-composer__input"
            data-testid="composer-input"
            contentEditable
            role="textbox"
            aria-multiline="false"
            aria-label={t.composerPlaceholder}
            data-placeholder={t.composerPlaceholder}
            suppressContentEditableWarning
            onInput={onInput}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setComposerFocused(true);
              window.requestAnimationFrame(updateCustomCaret);
            }}
            onBlur={() => setComposerFocused(false)}
            onClick={() => window.requestAnimationFrame(updateCustomCaret)}
            onKeyUp={() => window.requestAnimationFrame(updateCustomCaret)}
          />
          <span ref={composerCaretRef} className="adl-composer__caret" aria-hidden="true" hidden />
        </div>
        <div className="adl-composer__right">
          <TooltipSimple content="Voice" placement="top">
            <button type="button" className="adl-icon-btn" aria-label="Voice" disabled>
              <IconMic size={14} decorative />
            </button>
          </TooltipSimple>
          {buttonState === 'stop' ? (
            <TooltipSimple content={t.cancelGenerate} placement="top">
              <button
                type="button"
                className="adl-action-btn adl-action-btn--danger"
                data-testid="composer-send"
                onClick={onCancelStream}
                aria-label={t.cancelGenerate}
              >
                <IconStopCircle size={16} decorative />
              </button>
            </TooltipSimple>
          ) : buttonState === 'retry' ? (
            <TooltipSimple content={t.retry} placement="top">
              <button
                type="button"
                className="adl-action-btn adl-action-btn--warning"
                data-testid="composer-send"
                onClick={onSend}
                aria-label={t.retry}
              >
                <IconRefreshCw size={16} decorative />
              </button>
            </TooltipSimple>
          ) : (
            <TooltipSimple content={t.send} placement="top">
              <button
                type="button"
                className="adl-action-btn adl-action-btn--primary"
                data-testid="composer-send"
                onClick={onSend}
                disabled={!draft.trim()}
                aria-label={t.send}
              >
                <IconArrowUp size={16} decorative />
              </button>
            </TooltipSimple>
          )}
        </div>
      </div>
      <StatusBar
        inline
        appInfo={appInfo}
        currentWorkspace={appInfo?.currentWorkspace}
        modelHealth={modelHealth}
        isStreaming={!!streamingActiveRunId}
        activeRun={activeRun}
        workspaceContextMode={workspaceContextMode}
        recentWorkspaces={recentWorkspaces}
        gitSnapshot={gitSnapshot}
        gitBranches={gitBranches}
        onSelectModel={handleSelectModel}
        onOpenWorkspace={actions.openWorkspace}
        onClearWorkspaceContext={actions.clearWorkspaceContext}
        onPickWorkspaceDirectory={actions.pickWorkspaceDirectory}
        onRefreshGitBranches={actions.fetchGitBranches}
        onSwitchGitBranch={actions.switchGitBranch}
        onCreateGitBranch={actions.createGitBranch}
      />
    </footer>
  );
}
