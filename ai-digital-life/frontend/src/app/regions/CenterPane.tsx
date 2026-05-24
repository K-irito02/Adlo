import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  ApprovalRequestSummary,
  ModelProviderId,
  RecentWorkspaceEntry
} from "@ai-digital-life/kernel";
import type { CopyDict, Locale } from "../copy";
import { MODEL_PROVIDER_IDS } from "../constants";
import { WorkspaceSplitButton } from "../components/WorkspaceSplitButton";
import {
  IconArrowUp,
  IconBrain,
  IconFolder,
  IconFolderOpen,
  IconLightbulb,
  IconMessageQuestion,
  IconMessageSquare,
  IconMic,
  IconPlus,
  IconRefreshCw,
  IconStopCircle,
  IconShield
} from "../icons";
import { MessageBlocks } from "../MessageBlocks";
import { ContextBuilderPopover } from "../components/conversation/ContextBuilderPopover";
import { RunSummaryBlock } from "../components/conversation/RunSummaryBlock";
import { ApprovalCard } from "../components/approval/ApprovalCard";
import { useAppStore } from "../stores/slicedStore";
import { useAppActions } from "../hooks/useAppActions";
import { useUiStore } from "../ui-store";
import { TooltipSimple } from "../components/Tooltip";
import { StatusBar } from "./StatusBar";
import { ApprovalInlineCard, WelcomeState, ComposerFooter } from "./center-pane";

interface CenterPaneProps {
  t: CopyDict;
}

type ButtonState = "send" | "stop" | "retry" | "waiting";

export function CenterPane({ t }: CenterPaneProps) {
  const actions = useAppActions();
  const appInfo = useAppStore((s) => s.appInfo);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessionDetails = useAppStore(useShallow((s) => s.sessionDetails));
  const streamingAssistantText = useAppStore((s) => s.streamingAssistantText);
  const streamingActiveRunId = useAppStore((s) => s.streamingActiveRunId);
  const activeRun = useAppStore(useShallow((s) => s.activeRun));
  const runActivityByRunId = useAppStore(useShallow((s) => s.runActivityByRunId));
  const runUsageByRunId = useAppStore(useShallow((s) => s.runUsageByRunId));
  const modelHealth = useAppStore(useShallow((s) => s.modelHealth));
  const taskCenter = useAppStore(useShallow((s) => s.taskCenter));
  const workspaceContextMode = useAppStore((s) => s.workspaceContextMode);
  const gitSnapshot = useAppStore(useShallow((s) => s.gitSnapshot));
  const gitBranches = useAppStore(useShallow((s) => s.gitBranches));
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const fetchRunActivityByRunId = useAppStore((state) => state.fetchRunActivityByRunId);
  const locale = (appInfo?.config.language ?? "zh-CN") as Locale;
  const hasWorkspace = !!appInfo?.currentWorkspace;
  const activeDetail = activeSessionId ? sessionDetails[activeSessionId] : undefined;

  const handleSelectModel = useCallback(
    (providerId: ModelProviderId, modelId?: string) => {
      const patch: Record<ModelProviderId, { priority?: number; enabled?: boolean; modelId?: string }> =
        {} as Record<ModelProviderId, { priority?: number; enabled?: boolean; modelId?: string }>;
      for (const id of MODEL_PROVIDER_IDS) {
        if (id === providerId) {
          patch[id] = {
            priority: 1,
            enabled: true,
            ...(modelId ? { modelId } : {})
          };
        } else {
          patch[id] = { priority: 2 };
        }
      }
      void actions.updatePreferences({ modelPreferences: patch });
    },
    [actions.updatePreferences]
  );

  const [draft, setDraft] = useState("");
  const [hasError, setHasError] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);
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
    removeContextChip
  } = useUiStore(
    useShallow((state) => ({
      chatMode: state.chatMode,
      contextChips: state.contextChips,
      contextMenuOpen: state.contextMenuOpen,
      setChatMode: state.setChatMode,
      setContextMenuOpen: state.setContextMenuOpen,
      addContextChip: state.addContextChip,
      removeContextChip: state.removeContextChip
    }))
  );

  const messages = activeDetail?.messages ?? [];
  const visibleMessages = useMemo(
    () => messages.filter((message) => message.id !== "message-welcome"),
    [messages]
  );

  useEffect(() => {
    // Best-effort prefetch for replay: only when we see assistant messages with runId.
    const runIds = new Set<string>();
    for (const msg of visibleMessages) {
      if (msg.role === "assistant" && msg.runId) {
        runIds.add(msg.runId);
      }
    }
    runIds.forEach((runId) => {
      void fetchRunActivityByRunId(runId, 500);
    });
  }, [fetchRunActivityByRunId, visibleMessages]);

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    if (streamingAssistantText) {
      // Incremental streaming: 使用即时滚动避免卡顿
      el.scrollTop = el.scrollHeight;
    } else if (typeof el.scrollTo === "function") {
      // 用户操作（新消息）：使用平滑滚动
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleMessages.length, streamingAssistantText]);

  const buttonState: ButtonState = useMemo(() => {
    if (streamingActiveRunId) return "stop";
    if (hasError) return "retry";
    return "send";
  }, [hasError, streamingActiveRunId]);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content) return;
    try {
      setHasError(false);
      setDraft("");
      await actions.sendMessage(content, { mode: chatMode, chips: contextChips });
    } catch {
      setHasError(true);
    }
  }, [actions.sendMessage, chatMode, contextChips, draft]);

  const updateCustomCaret = useCallback(() => {
    const editor = composerInputRef.current;
    const editorWrap = composerEditorRef.current;
    const caret = composerCaretRef.current;
    if (!editor || !editorWrap || !caret) return;

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

    if ((rect.width === 0 && rect.height === 0) || !(editor.textContent ?? "").length) {
      caret.style.left = "0px";
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
    if (!el) return;
    const nextValue = draft;
    if (el.textContent !== nextValue) {
      el.textContent = nextValue;
    }
    window.requestAnimationFrame(updateCustomCaret);
  }, [draft, updateCustomCaret]);

  useEffect(() => {
    if (!composerFocused) return;

    const syncCaret = () => window.requestAnimationFrame(updateCustomCaret);
    document.addEventListener("selectionchange", syncCaret);
    window.addEventListener("resize", syncCaret);

    syncCaret();
    return () => {
      document.removeEventListener("selectionchange", syncCaret);
      window.removeEventListener("resize", syncCaret);
    };
  }, [composerFocused, updateCustomCaret]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!event.shiftKey && buttonState === "send") {
          void handleSend();
        }
      }
      if (event.key === "Escape" && streamingActiveRunId) {
        event.preventDefault();
        actions.cancelActiveStream();
      }
    },
    [actions.cancelActiveStream, buttonState, handleSend, streamingActiveRunId]
  );

  const onInput = useCallback((event: React.FormEvent<HTMLDivElement>) => {
    const normalized = (event.currentTarget.textContent ?? "").replace(/\s*[\r\n]+\s*/g, " ");
    if (event.currentTarget.textContent !== normalized) {
      event.currentTarget.textContent = normalized;
    }
    setDraft(normalized);
    window.requestAnimationFrame(updateCustomCaret);
  }, [updateCustomCaret]);

  const hasMessages = visibleMessages.length > 0 || !!streamingAssistantText;

  return (
    <section className="adl-center" aria-label={t.conversation}>
      {taskCenter?.pendingApprovals?.length ? (
        <div className="adl-center__approvals">
          {taskCenter.pendingApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              t={t}
              approval={approval}
              onDecide={actions.decideApproval}
            />
          ))}
        </div>
      ) : null}

      {/* Region 8 / 9: Main stream area */}
      <div className={`adl-center__body${!activeDetail || !hasMessages ? " adl-center__body--empty" : ""}`} ref={streamRef}>
        {!activeDetail || !hasMessages ? (
          <div className="adl-center__empty">
            <WelcomeState
              t={t}
              hasWorkspace={hasWorkspace}
              recentWorkspaces={recentWorkspaces}
              onOpenWorkspace={actions.openWorkspace}
              onPickWorkspaceDirectory={actions.pickWorkspaceDirectory}
              onCreateSession={() => void actions.createSession()}
            />
          </div>
        ) : (
          <div className="adl-message-stream">
            {visibleMessages.map((messageItem) => (
              <React.Fragment key={messageItem.id}>
                <article className={`adl-message adl-message--${messageItem.role}`}>
                  <header>
                    <strong>{messageItem.role}</strong>
                    <time>
                      {new Date(messageItem.createdAt).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </time>
                  </header>
                  <p>{messageItem.content}</p>
                  <MessageBlocks message={messageItem} t={t} />
                </article>
                {messageItem.role === "assistant" && messageItem.runId ? (
                  <RunSummaryBlock
                    t={t}
                    runId={messageItem.runId}
                    run={activeRun?.run.id === messageItem.runId ? activeRun : undefined}
                    events={runActivityByRunId[messageItem.runId] ?? []}
                    usage={runUsageByRunId[messageItem.runId]}
                    defaultExpanded={false}
                  />
                ) : null}
              </React.Fragment>
            ))}
            {activeRun?.run.status === "waiting-approval" && (
              <div className="adl-center__approval-hint">
                <IconShield size={14} decorative />
                <span>{t.approvalWaitingHint}</span>
              </div>
            )}
            {streamingAssistantText ? (
              <article className="adl-message adl-message--assistant adl-message--streaming">
                <header>
                  <strong>assistant</strong>
                  <span className="adl-agent-status adl-agent-status--processing">
                    <IconBrain size={12} decorative />
                    {t.agentGenerating}
                  </span>
                </header>
                <p>{streamingAssistantText}</p>
              </article>
            ) : null}
            {streamingActiveRunId ? (
              <RunSummaryBlock
                t={t}
                runId={streamingActiveRunId}
                events={runActivityByRunId[streamingActiveRunId] ?? []}
                usage={runUsageByRunId[streamingActiveRunId]}
                defaultExpanded
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Region 10-12: Composer */}
      <ComposerFooter
        t={t}
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
}
