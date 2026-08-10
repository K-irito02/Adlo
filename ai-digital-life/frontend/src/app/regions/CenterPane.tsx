import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Locale } from '../i18n';
import { useTCopy } from '../i18n/useTCopy';
import { ApprovalCard } from '../components/approval/ApprovalCard';
import { MessageStream } from '../components/MessageStream';
import { useAppStore } from '../stores/slicedStore';
import { useAppActions } from '../hooks/useAppActions';
import { usePartStream } from '../features/part-stream/usePartStream';
import { PartConversation } from '../features/part-stream/PartConversation';
import { SessionFileTabs } from '../features/part-stream/SessionFileTabs';
import {
  collectSessionFileParts,
  filePartUrlToWorkspaceRelativePath,
} from '../features/part-stream/partFileUtils';
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
      })),
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
      })),
    );
  const { taskCenter, gitSnapshot, gitBranches, recentWorkspaces, fetchRunActivityByRunId } =
    useAppStore(
      useShallow((s) => ({
        taskCenter: s.taskCenter,
        gitSnapshot: s.gitSnapshot,
        gitBranches: s.gitBranches,
        recentWorkspaces: s.recentWorkspaces,
        fetchRunActivityByRunId: s.fetchRunActivityByRunId,
      })),
    );
  const locale = (appInfo?.config.language ?? 'zh-CN') as Locale;
  const hasWorkspace = !!appInfo?.currentWorkspace;
  const activeDetail = activeSessionId ? sessionDetails[activeSessionId] : undefined;
  const listSnapshots = useAppStore((s) => s.listSnapshots);

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
    })),
  );

  const messages = useMemo(() => activeDetail?.messages ?? [], [activeDetail]);

  // S2 part-stream (Task 10): the Part conversation is the PRIMARY render path
  // once a session has part data. `usePartStream` hydrates history +
  // subscribes the raw SSE part events; `PartConversation` renders the
  // message/part/ask/status tree. The legacy `MessageStream` (ConversationMessageRecord)
  // is retained ONLY as the fallback for sessions without part data (pre-S1
  // sessions / mock) — it is deliberately NOT a compat layer for part data.
  const partState = usePartStream(activeSessionId);
  const hasPartMessages = (partState?.messages.size ?? 0) > 0;
  const hasPartQuestions = (partState?.questions.length ?? 0) > 0;
  const hasPartData = hasPartMessages || hasPartQuestions;

  /**
   * User prompt text by part-message id. The Part wire carries NO user text
   * (MessageRecord has no `content`; the loop attaches no text part to user
   * messages) — it lives only on the legacy ConversationMessageRecord the S1
   * bridge persists (`kick_agent_run`), loaded into `sessionDetails`. Two
   * correlations (see PartConversation):
   *   1. direct: the `message.created` kick announcement carries the
   *      ConversationMessageRecord id (`message_xxx`) — look up by id.
   *   2. assistant-hop: the hydrated user MessageRecord (`msg_xxx`) is the
   *      `parentID` of the assistant message whose id == the ConversationMessageRecord
   *      `runId` — resolve via that chain.
   */
  const userTextByMessageId = useMemo(() => {
    const map = new Map<string, string>();
    const convMessages = activeDetail?.messages ?? [];
    const userConv = convMessages.filter((m) => m.role === 'user');
    for (const m of userConv) {
      map.set(m.id, m.content);
    }
    if (partState) {
      for (const [msgId, msg] of partState.messages) {
        if (msg.role !== 'user' || map.has(msgId)) {
          continue;
        }
        let assistantId: string | undefined;
        for (const [id, candidate] of partState.messages) {
          if (candidate.role === 'assistant' && candidate.parentID === msgId) {
            assistantId = id;
            break;
          }
        }
        if (!assistantId) {
          continue;
        }
        const conv = userConv.find((c) => c.runId === assistantId);
        if (conv) {
          map.set(msgId, conv.content);
        }
      }
    }
    return map;
  }, [activeDetail, partState]);

  const handlePartReply = useCallback((requestID: string, answers: string[]) => {
    void window.digitalLife?.conversation.replyToQuestion(requestID, answers);
  }, []);

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

  // S3 Task 2: session file tab strip — `file` parts (FilePartData) collected
  // from the session's partsByMessage, deduped by url. Rendered above the
  // PartConversation so the user can jump from a file the assistant touched to
  // the editor tab for that file.
  const sessionFileParts = useMemo(
    () => (partState ? collectSessionFileParts(partState.partsByMessage) : []),
    [partState],
  );
  const handleOpenFile = useCallback(
    (url: string) => {
      const relativePath = filePartUrlToWorkspaceRelativePath(url, workspaceRoot);
      if (relativePath) {
        void actions.openFile(relativePath);
      }
    },
    [actions, workspaceRoot],
  );

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
      .catch((err) => {
        console.warn('center pane snapshot failed', err);
        setLatestSnapshotId(null);
      });
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
    [actions, buttonState, handleSend, streamingActiveRunId],
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
    [updateCustomCaret],
  );

  const hasMessages =
    messages.filter((m) => m.id !== 'message-welcome').length > 0 ||
    !!streamingAssistantText ||
    hasPartData;

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
      <div className={`adl-center__body${!hasMessages ? ' adl-center__body--empty' : ''}`}>
        {!hasMessages ? (
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
              {activeDetail ? (
                <ForkButton
                  parentSession={activeDetail.session}
                  forkMessageId={activeDetail.messages[activeDetail.messages.length - 1]?.id ?? ''}
                />
              ) : null}
              {latestSnapshotId && appInfo?.currentWorkspace ? (
                <RevertButton
                  snapshotId={latestSnapshotId}
                  workspaceId={appInfo.currentWorkspace.id}
                  workspaceRoot={appInfo.currentWorkspace.rootPath}
                />
              ) : null}
            </div>
            {hasPartData && partState ? (
              <>
                <SessionFileTabs files={sessionFileParts} onSelect={handleOpenFile} />
                <PartConversation
                  state={partState}
                  userTextByMessageId={userTextByMessageId}
                  onReply={handlePartReply}
                />
              </>
            ) : (
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
            )}
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
        actions={actions}
      />
    </section>
  );
});

export { CenterPane };
