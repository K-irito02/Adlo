import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  AgentRunDetail,
  AppInfo,
  DigitalLifeRunActivityEventV1,
  GitBranchSummary,
  GitSnapshot,
  ModelProviderId,
  ModelTokenUsage,
  ModelGatewayHealthSnapshot,
  ApprovalRequestSummary,
  ConversationDetail,
  RecentWorkspaceEntry,
  TaskCenterSnapshot,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput
} from "@ai-digital-life/kernel";
import type { CopyDict, Locale } from "../copy";
import { WorkspaceSplitButton } from "../components/WorkspaceSplitButton";
import {
  IconArrowUp,
  IconBookOpen,
  IconBrain,
  IconBug,
  IconClipboardList,
  IconCpu,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconImagePlus,
  IconLightbulb,
  IconLink,
  IconMessageQuestion,
  IconMessageSquare,
  IconMic,
  IconPlug,
  IconPlus,
  IconRefreshCw,
  IconSparkles,
  IconStopCircle,
  IconShield
} from "../icons";
import { MessageBlocks } from "../MessageBlocks";
import { RunSummaryBlock } from "../components/conversation/RunSummaryBlock";
import { ApprovalCard } from "../components/approval/ApprovalCard";
import { useAppStore } from "../slicedStore";
import { type ChatMode, type ContextChip, useUiStore } from "../ui-store";
import { TooltipSimple } from "../components/Tooltip";
import { StatusBar } from "./StatusBar";

interface CenterPaneProps {
  t: CopyDict;
  locale: Locale;
  appInfo?: AppInfo;
  hasWorkspace: boolean;
  activeDetail?: ConversationDetail;
  streamingAssistantText: string;
  streamingActiveRunId?: string;
  activeRun?: AgentRunDetail;
  runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId: Record<string, ModelTokenUsage | undefined>;
  modelHealth?: ModelGatewayHealthSnapshot;
  taskCenter?: TaskCenterSnapshot;
  workspaceContextMode: "workspace" | "global";
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  recentWorkspaces: RecentWorkspaceEntry[];
  onSendMessage: (content: string, opts: { mode: ChatMode; chips: ContextChip[] }) => Promise<void>;
  onCancelGenerate: () => void;
  onOpenWorkspace: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onTriggerCreateWorkspace: () => void;
  onClearWorkspaceContext: () => Promise<void>;
  onPickWorkspaceDirectory: () => Promise<string | undefined>;
  onCreateSession: () => void;
  onDecideApproval: (approvalId: string, decision: "approved" | "rejected") => void;
  onSelectModel: (providerId: ModelProviderId, modelId?: string) => void;
  onRefreshGitBranches: () => Promise<void>;
  onSwitchGitBranch: (input: WorkspaceGitBranchSwitchInput) => Promise<void>;
  onCreateGitBranch: (input: WorkspaceGitBranchCreateInput) => Promise<void>;
}

type ButtonState = "send" | "stop" | "retry" | "waiting";

function ContextBuilderPopover({
  t,
  open,
  onClose,
  chatMode,
  onSelectMode,
  onAddChip
}: {
  t: CopyDict;
  open: boolean;
  onClose: () => void;
  chatMode: ChatMode;
  onSelectMode: (mode: ChatMode) => void;
  onAddChip: (chip: ContextChip) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const uid = () => `ctx-${Math.random().toString(36).slice(2, 10)}`;

  return (
    <div ref={ref} className="adl-context-popover" role="dialog" aria-label={t.contextBuilderHeading}>
      <header>{t.contextBuilderHeading}</header>
      <section>
        <h5>{t.contextGroupModes}</h5>
        <button
          type="button"
          className={`adl-context-item${chatMode === "plan" ? " is-active" : ""}`}
          onClick={() => {
            onSelectMode("plan");
            onClose();
          }}
        >
          <IconClipboardList size={14} decorative />
          <span>{t.chatModePlan}</span>
        </button>
        <button
          type="button"
          className={`adl-context-item${chatMode === "debug" ? " is-active" : ""}`}
          onClick={() => {
            onSelectMode("debug");
            onClose();
          }}
        >
          <IconBug size={14} decorative />
          <span>{t.chatModeDebug}</span>
        </button>
        <button
          type="button"
          className={`adl-context-item${chatMode === "ask" ? " is-active" : ""}`}
          onClick={() => {
            onSelectMode("ask");
            onClose();
          }}
        >
          <IconMessageQuestion size={14} decorative />
          <span>{t.chatModeAsk}</span>
        </button>
      </section>
      <section>
        <h5>{t.contextGroupCapabilities}</h5>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: "model", label: t.contextAddModel });
            onClose();
          }}
        >
          <IconCpu size={14} decorative />
          <span>{t.contextAddModel}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: "skill", label: t.contextAddSkill });
            onClose();
          }}
        >
          <IconSparkles size={14} decorative />
          <span>{t.contextAddSkill}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: "mcp", label: t.contextAddMcp });
            onClose();
          }}
        >
          <IconPlug size={14} decorative />
          <span>{t.contextAddMcp}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: "file", label: t.contextAddImage });
            onClose();
          }}
        >
          <IconImagePlus size={14} decorative />
          <span>{t.contextAddImage}</span>
        </button>
      </section>
      <section>
        <h5>{t.contextGroupReferences}</h5>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: "file", label: t.contextAddFile });
            onClose();
          }}
        >
          <IconFileText size={14} decorative />
          <span>{t.contextAddFile}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: "doc", label: t.contextAddDoc });
            onClose();
          }}
        >
          <IconBookOpen size={14} decorative />
          <span>{t.contextAddDoc}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: "url", label: t.contextAddUrl });
            onClose();
          }}
        >
          <IconLink size={14} decorative />
          <span>{t.contextAddUrl}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: "codebase", label: t.contextAddCodebase });
            onClose();
          }}
        >
          <IconDatabase size={14} decorative />
          <span>{t.contextAddCodebase}</span>
        </button>
      </section>
    </div>
  );
}

function ApprovalInlineCard({
  approval,
  t,
  onDecide
}: {
  approval: ApprovalRequestSummary;
  t: CopyDict;
  onDecide: (id: string, decision: "approved" | "rejected") => void;
}) {
  return (
    <article className="adl-inline-approval" role="alert">
      <header>
        <IconMessageQuestion size={16} decorative />
        <span className="adl-inline-approval__title">{approval.title}</span>
        <span className="adl-chip adl-chip--warning">{approval.riskLevel}</span>
      </header>
      <p>{approval.description}</p>
      {approval.impact?.length ? (
        <ul>
          {approval.impact.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      ) : null}
      <div className="adl-inline-approval__actions">
        <button
          type="button"
          className="adl-btn adl-btn--primary adl-btn--sm"
          onClick={() => onDecide(approval.id, "approved")}
        >
          {t.approve}
        </button>
        <button
          type="button"
          className="adl-btn adl-btn--ghost adl-btn--sm"
          onClick={() => onDecide(approval.id, "rejected")}
        >
          {t.rejectApproval}
        </button>
      </div>
    </article>
  );
}

function WelcomeState({
  t,
  hasWorkspace,
  recentWorkspaces,
  onOpenWorkspace,
  onPickWorkspaceDirectory,
  onCreateSession
}: {
  t: CopyDict;
  hasWorkspace: boolean;
  recentWorkspaces: RecentWorkspaceEntry[];
  onOpenWorkspace: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onPickWorkspaceDirectory: () => Promise<string | undefined>;
  onCreateSession: () => void;
}) {
  const [showActionCard, setShowActionCard] = useState(false);
  const actionCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showActionCard) return;
    const onPointerDown = (event: MouseEvent) => {
      if (actionCardRef.current && !actionCardRef.current.contains(event.target as Node)) {
        setShowActionCard(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showActionCard]);

  if (!hasWorkspace) {
    return (
      <div className="adl-welcome adl-welcome--panel" aria-label="欢迎页">
        <section className="adl-welcome__recent" aria-label={t.welcomeRecentWorkspaces}>
          <header className="adl-welcome__section-header">
            <h3>{t.welcomeRecentWorkspaces}</h3>
          </header>
          {recentWorkspaces.length ? (
            <ul className="adl-welcome__recent-list">
              {recentWorkspaces.slice(0, 5).map((workspace) => (
                <li key={workspace.path}>
                  <button type="button" onClick={() => onOpenWorkspace(workspace.path)}>
                    <span className="adl-welcome__recent-icon" aria-hidden="true">
                      <IconFolder size={14} decorative />
                    </span>
                    <span className="adl-welcome__recent-name">{workspace.name}</span>
                    <span className="adl-welcome__path">{workspace.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="adl-welcome__empty">{t.workspaceRecentEmpty}</p>
          )}
        </section>

        <div className="adl-welcome__actionsbar" aria-label="快速操作">
          <button type="button" className="adl-btn adl-btn--lg" onClick={onCreateSession}>
            <IconMessageSquare size={16} decorative />
            {t.newConversation}
          </button>
          <div className="adl-welcome__action-wrap" ref={actionCardRef}>
            <button type="button" className="adl-btn adl-btn--ghost adl-btn--lg" onClick={() => setShowActionCard((v) => !v)}>
              <IconFolderOpen size={16} decorative />
              {t.welcomeOpenWorkspace}
            </button>
            {showActionCard ? (
              <div className="adl-welcome__action-card">
                <div className="adl-statusbar__menu-section">
                  <strong className="adl-statusbar__menu-subtitle">{t.workspaceOpenTitle}</strong>
                  <WorkspaceSplitButton
                    t={t}
                    onPickWorkspaceDirectory={onPickWorkspaceDirectory}
                    onOpenWorkspace={onOpenWorkspace}
                    onClose={() => setShowActionCard(false)}
                    initialMode="pick"
                    persistMode={false}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <section className="adl-welcome__hints" aria-label={t.welcomeHints}>
          <header className="adl-welcome__section-header">
            <IconLightbulb size={16} decorative />
            <span>{t.welcomeHints}</span>
          </header>
          <ul>
            <li>{t.welcomeHintDrag}</li>
            <li>{t.welcomeHintOpen}</li>
            <li>{t.welcomeHintNewWorkspace}</li>
            <li>{t.welcomeHintNewSession}</li>
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="adl-empty-stream" aria-hidden="true" />
  );
}

export function CenterPane({
  t,
  locale,
  appInfo,
  hasWorkspace,
  activeDetail,
  streamingAssistantText,
  streamingActiveRunId,
  activeRun,
  runActivityByRunId,
  runUsageByRunId,
  modelHealth,
  taskCenter,
  workspaceContextMode,
  gitSnapshot,
  gitBranches,
  recentWorkspaces,
  onSendMessage,
  onCancelGenerate,
  onOpenWorkspace,
  onTriggerCreateWorkspace,
  onClearWorkspaceContext,
  onPickWorkspaceDirectory,
  onCreateSession,
  onDecideApproval,
  onSelectModel,
  onRefreshGitBranches,
  onSwitchGitBranch,
  onCreateGitBranch
}: CenterPaneProps) {
  const fetchRunActivityByRunId = useAppStore((state) => state.fetchRunActivityByRunId);
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
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else if (el) {
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
      await onSendMessage(content, { mode: chatMode, chips: contextChips });
    } catch {
      setHasError(true);
    }
  }, [chatMode, contextChips, draft, onSendMessage]);

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
        onCancelGenerate();
      }
    },
    [buttonState, handleSend, onCancelGenerate, streamingActiveRunId]
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
              onDecide={onDecideApproval}
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
              onOpenWorkspace={onOpenWorkspace}
              onPickWorkspaceDirectory={onPickWorkspaceDirectory}
              onCreateSession={onCreateSession}
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
      <footer className="adl-composer" aria-label="Message composer">
        {contextChips.length ? (
          <div className="adl-composer__chips">
            {contextChips.map((chip) => (
              <span key={chip.id} className={`adl-chip adl-chip--${chip.kind}`}>
                <span>{chip.label}</span>
                <button
                  type="button"
                  onClick={() => removeContextChip(chip.id)}
                  aria-label="Remove"
                >
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
              t={t}
              open={contextMenuOpen}
              onClose={() => setContextMenuOpen(false)}
              chatMode={chatMode}
              onSelectMode={setChatMode}
              onAddChip={addContextChip}
            />
          </div>
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
            <span
              ref={composerCaretRef}
              className="adl-composer__caret"
              aria-hidden="true"
              hidden
            />
          </div>
          <div className="adl-composer__right">
            <TooltipSimple content="Voice" placement="top">
              <button
                type="button"
                className="adl-icon-btn"
                aria-label="Voice"
                disabled
              >
                <IconMic size={14} decorative />
              </button>
            </TooltipSimple>
            {buttonState === "stop" ? (
            <TooltipSimple content={t.cancelGenerate} placement="top">
              <button
                type="button"
                className="adl-action-btn adl-action-btn--danger"
                data-testid="composer-send"
                onClick={onCancelGenerate}
                aria-label={t.cancelGenerate}
              >
                <IconStopCircle size={16} decorative />
              </button>
            </TooltipSimple>
            ) : buttonState === "retry" ? (
            <TooltipSimple content={t.retry} placement="top">
              <button
                type="button"
                className="adl-action-btn adl-action-btn--warning"
                data-testid="composer-send"
                onClick={() => void handleSend()}
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
                onClick={() => void handleSend()}
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
          t={t}
          appInfo={appInfo}
          currentWorkspace={appInfo?.currentWorkspace}
          modelHealth={modelHealth}
          isStreaming={!!streamingActiveRunId}
          activeRun={activeRun}
          workspaceContextMode={workspaceContextMode}
          recentWorkspaces={recentWorkspaces}
          gitSnapshot={gitSnapshot}
          gitBranches={gitBranches}
          onSelectModel={onSelectModel}
          onOpenWorkspace={onOpenWorkspace}
          onClearWorkspaceContext={onClearWorkspaceContext}
          onPickWorkspaceDirectory={onPickWorkspaceDirectory}
          onRefreshGitBranches={onRefreshGitBranches}
          onSwitchGitBranch={onSwitchGitBranch}
          onCreateGitBranch={onCreateGitBranch}
        />
      </footer>

    </section>
  );
}
