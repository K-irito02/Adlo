import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ModelProviderId } from '@ai-digital-life/kernel';
import type { Locale } from '../i18n';
import { useTCopy } from '../i18n/useTCopy';
import { MODEL_PROVIDER_IDS } from '../utils/constants';
import { ApprovalCard } from '../components/approval/ApprovalCard';
import { MessageStream } from '../components/MessageStream';
import { useAppStore } from '../stores/slicedStore';
import { useAppActions } from '../hooks/useAppActions';
import { asAgentRunID } from '../../shared/branded';

import { CompactionIndicator } from '../components/conversation/CompactionIndicator';
import { ForkButton } from '../features/session-fork/ForkButton';
import { RevertButton } from '../components/conversation/RevertButton';
import { WelcomeState, ComposerFooter } from './center-pane';

type ButtonState = 'send' | 'stop' | 'retry' | 'waiting';

const CenterPane = React.memo(function CenterPane() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const { activeSessionId, streamingAssistantText, streamingActiveRunId, workspaceContextMode } =
    useAppStore(
      useShallow((s) => ({
        activeSessionId: s.activeSessionId,
        streamingAssistantText: s.streamingAssistantText,
        streamingActiveRunId: s.streamingActiveRunId,
        workspaceContextMode: s.workspaceContextMode,
      }))
    );
  const { appInfo, sessionDetails, activeRun, runActivityByRunId, runUsageByRunId, modelHealth } =
    useAppStore(
      useShallow((s) => ({
        appInfo: s.appInfo,
        sessionDetails: s.sessionDetails,
        activeRun: s.activeRun,
        runActivityByRunId: s.runActivityByRunId,
        runUsageByRunId: s.runUsageByRunId,
        modelHealth: s.modelHealth,
      }))
    );
  const { taskCenter, gitSnapshot, gitBranches, recentWorkspaces, fetchRunActivityByRunId } =
    useAppStore(
      useShallow((s) => ({
        taskCenter: s.taskCenter,
        gitSnapshot: s.gitSnapshot,
        gitBranches: s.gitBranches,
        recentWorkspaces: s.recentWorkspaces,
        fetchRunActivityByRunId: s.fetchRunActivityByRunId,
      }))
    );
  const locale = (appInfo?.config.language ?? 'zh-CN') as Locale;
  const hasWorkspace = !!appInfo?.currentWorkspace;
  const activeDetail = activeSessionId ? sessionDetails[activeSessionId] : undefined;
  const listSnapshots = useAppStore((s) => s.listSnapshots);

  const handleSelectModel = useCallback(
    (providerId: ModelProviderId, modelId?: string) => {
      const patch: Record<
        ModelProviderId,
        { priority?: number; enabled?: boolean; modelId?: string }
      > = {} as Record<ModelProviderId, { priority?: number; enabled?: boolean; modelId?: string }>;
      for (const id of MODEL_PROVIDER_IDS) {
        if (id === providerId) {
          patch[id] = {
            priority: 1,
            enabled: true,
            ...(modelId ? { modelId } : {}),
          };
        } else {
          patch[id] = { priority: 2 };
        }
      }
      void actions.updatePreferences({ modelPreferences: patch });
    },
    [actions]
  );

  const [draft, setDraft] = useState('');
  const [hasError, setHasError] = useState(false);
  const [latestSnapshotId, setLatestSnapshotId] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const composerEditorRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLDivElement | null>(null);
  const composerCaretRef = useRef<HTMLSpanElement | null>(null);
  const {
    chatMode,
    contextChips,
    contextMenuOpen,
    setChatMode,
    setContextMenuOpen,
    addContextChip,
    removeContextChip,
  } = useAppStore(
    useShallow((state) => ({
      chatMode: state.chatMode,
      contextChips: state.contextChips,
      contextMenuOpen: state.contextMenuOpen,
      setChatMode: state.setChatMode,
      setContextMenuOpen: state.setContextMenuOpen,
      addContextChip: state.addContextChip,
      removeContextChip: state.removeContextChip,
    }))
  );

  const messages = useMemo(() => activeDetail?.messages ?? [], [activeDetail]);

  useEffect(() => {
    // Best-effort prefetch for replay: only when we see assistant messages with runId.
    const runIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.runId) {
        runIds.add(msg.runId);
      }
    }
    runIds.forEach((runId) => {
      void fetchRunActivityByRunId(asAgentRunID(runId), 500);
    });
  }, [fetchRunActivityByRunId, messages]);

  const workspaceId = appInfo?.currentWorkspace?.id;
  const workspaceRoot = appInfo?.currentWorkspace?.rootPath;
  useEffect(() => {
    if (!workspaceId || !workspaceRoot) {
      setLatestSnapshotId(null);
      return;
    }
    void listSnapshots(workspaceId, workspaceRoot)
      .then((snapshots) => {
        if (!snapshots.length) {
          setLatestSnapshotId(null);
          return;
        }
        const latest = snapshots.reduce((a, b) => (a.created_at > b.created_at ? a : b));
        setLatestSnapshotId(latest.id);
      })
      .catch(() => setLatestSnapshotId(null));
  }, [workspaceId, workspaceRoot, listSnapshots]);

  const buttonState: ButtonState = useMemo(() => {
    if (streamingActiveRunId) {
      return 'stop';
    }
    if (hasError) {
      return 'retry';
    }
    return 'send';
  }, [hasError, streamingActiveRunId]);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content) {
      return;
    }
    try {
      setHasError(false);
      setDraft('');
      await actions.sendMessage(content, { mode: chatMode, chips: contextChips });
    } catch {
      setHasError(true);
    }
  }, [actions, chatMode, contextChips, draft]);

  const updateCustomCaret = useCallback(() => {
    const editor = composerInputRef.current;
    const editorWrap = composerEditorRef.current;
    const caret = composerCaretRef.current;
    if (!editor || !editorWrap || !caret) {
      return;
    }

    const selection = window.getSelection();
    if (
      !composerFocused ||
      !selection ||
      selection.rangeCount === 0 ||
      !selection.isCollapsed ||
      !editor.contains(selection.anchorNode)
    ) {
      caret.hidden = true;
      return;
    }

    const editorWrapRect = editorWrap.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(editor);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 28;
    const caretHeight = Math.max(18, lineHeight - 6);
    const caretOffset = Math.max(0, (lineHeight - caretHeight) / 2);
    const range = selection.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();

    if ((rect.width === 0 && rect.height === 0) || !(editor.textContent ?? '').length) {
      caret.style.left = '0px';
      caret.style.top = `${Math.max(0, (editorWrapRect.height - lineHeight) / 2) + caretOffset}px`;
      caret.style.height = `${caretHeight}px`;
      caret.hidden = false;
      return;
    }

    caret.style.left = `${Math.max(0, rect.left - editorWrapRect.left)}px`;
    caret.style.top = `${Math.max(0, rect.top - editorWrapRect.top) + caretOffset}px`;
    caret.style.height = `${Math.max(caretHeight, rect.height - 6)}px`;
    caret.hidden = false;
  }, [composerFocused]);

  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) {
      return;
    }
    const nextValue = draft;
    if (el.textContent !== nextValue) {
      el.textContent = nextValue;
    }
    window.requestAnimationFrame(updateCustomCaret);
  }, [draft, updateCustomCaret]);

  useEffect(() => {
    if (!composerFocused) {
      return;
    }

    const syncCaret = () => window.requestAnimationFrame(updateCustomCaret);
    document.addEventListener('selectionchange', syncCaret);
    window.addEventListener('resize', syncCaret);

    syncCaret();
    return () => {
      document.removeEventListener('selectionchange', syncCaret);
      window.removeEventListener('resize', syncCaret);
    };
  }, [composerFocused, updateCustomCaret]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!event.shiftKey && buttonState === 'send') {
          void handleSend();
        }
      }
      if (event.key === 'Escape' && streamingActiveRunId) {
        event.preventDefault();
        actions.cancelActiveStream();
      }
    },
    [actions, buttonState, handleSend, streamingActiveRunId]
  );

  const onInput = useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      const normalized = (event.currentTarget.textContent ?? '').replace(/\s*[\r\n]+\s*/g, ' ');
      if (event.currentTarget.textContent !== normalized) {
        event.currentTarget.textContent = normalized;
      }
      setDraft(normalized);
      window.requestAnimationFrame(updateCustomCaret);
    },
    [updateCustomCaret]
  );

  const hasMessages =
    messages.filter((m) => m.id !== 'message-welcome').length > 0 || !!streamingAssistantText;

  return (
    <section className="adl-center" aria-label={t.conversation}>
      {taskCenter?.pendingApprovals?.length ? (
        <div className="adl-center__approvals">
          {taskCenter.pendingApprovals.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} onDecide={actions.decideApproval} />
          ))}
        </div>
      ) : null}

      {/* Region 8 / 9: Main stream area */}
      <div
        className={`adl-center__body${!activeDetail || !hasMessages ? ' adl-center__body--empty' : ''}`}
      >
        {!activeDetail || !hasMessages ? (
          <div className="adl-center__empty">
            <WelcomeState
              hasWorkspace={hasWorkspace}
              recentWorkspaces={recentWorkspaces}
              onOpenWorkspace={actions.openWorkspace}
              onPickWorkspaceDirectory={actions.pickWorkspaceDirectory}
              onCreateSession={() => void actions.createSession()}
            />
          </div>
        ) : (
          <>
            <CompactionIndicator />
            <div className="adl-center__toolbar">
              <ForkButton
                parentSession={activeDetail.session}
                forkMessageId={activeDetail.messages[activeDetail.messages.length - 1]?.id ?? ''}
                existingForkCount={0}
              />
              {latestSnapshotId && appInfo?.currentWorkspace ? (
                <RevertButton
                  snapshotId={latestSnapshotId}
                  workspaceId={appInfo.currentWorkspace.id}
                  workspaceRoot={appInfo.currentWorkspace.rootPath}
                />
              ) : null}
            </div>
            <MessageStream
              messages={messages}
              streamingText={streamingAssistantText}
              isStreaming={!!streamingAssistantText}
              activeRun={activeRun}
              streamingActiveRunId={streamingActiveRunId}
              runActivityByRunId={runActivityByRunId}
              runUsageByRunId={runUsageByRunId}
              locale={locale}
            />
          </>
        )}
      </div>

      {/* Region 10-12: Composer */}
      <ComposerFooter
        draft={draft}
        buttonState={buttonState}
        chatMode={chatMode}
        contextChips={contextChips}
        contextMenuOpen={contextMenuOpen}
        setContextMenuOpen={setContextMenuOpen}
        setChatMode={setChatMode}
        addContextChip={addContextChip}
        removeContextChip={removeContextChip}
        onSend={() => void handleSend()}
        onCancelStream={() => actions.cancelActiveStream()}
        composerEditorRef={composerEditorRef}
        composerInputRef={composerInputRef}
        composerCaretRef={composerCaretRef}
        setComposerFocused={setComposerFocused}
        updateCustomCaret={updateCustomCaret}
        onInput={onInput}
        onKeyDown={onKeyDown}
        appInfo={appInfo}
        modelHealth={modelHealth}
        streamingActiveRunId={streamingActiveRunId}
        activeRun={activeRun}
        workspaceContextMode={workspaceContextMode}
        recentWorkspaces={recentWorkspaces}
        gitSnapshot={gitSnapshot}
        gitBranches={gitBranches}
        handleSelectModel={handleSelectModel}
        actions={actions}
      />
    </section>
  );
});

export { CenterPane };
