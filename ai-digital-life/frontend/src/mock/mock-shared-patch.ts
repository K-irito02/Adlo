import type { AgentRunDetail, ConversationMessageRecord, PatchSet } from "@ai-digital-life/kernel";
import { activeWorkspaceScopeId, documents } from "./mock-shared-workspace";
import { messagesBySession, sessions } from "./mock-shared-conversation";

export let activePatchSet: PatchSet | undefined;
export let activeRun: AgentRunDetail | undefined;

export function setActivePatchSet(patchSet: PatchSet | undefined): void {
  activePatchSet = patchSet;
}

export function setActiveRun(run: AgentRunDetail | undefined): void {
  activeRun = run;
}

export function createPatchSet(sessionId: string, relativePath: string, prompt: string): PatchSet {
  const beforeContent = documents.get(relativePath) ?? "";
  const afterContent = `// AI Digital Life: ${prompt.trim()}\n${beforeContent}`;
  const workspaceId = activeWorkspaceScopeId();
  const patchSet: PatchSet = {
    id: `patchset-${Date.now()}`,
    workspaceId,
    sessionId,
    runId: activeRun?.run.id,
    title: `Update ${relativePath}`,
    summary: `建议在 ${relativePath} 顶部加入任务说明注释。`,
    status: "ready",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    filePatches: [
      {
        id: `filepatch-${Date.now()}`,
        patchSetId: `patchset-${Date.now()}`,
        relativePath,
        beforeContent,
        afterContent,
        hunks: [
          {
            id: `hunk-${Date.now()}`,
            filePatchId: `filepatch-${Date.now()}`,
            patchSetId: `patchset-${Date.now()}`,
            relativePath,
            oldStart: 1,
            oldLines: beforeContent.split(/\r?\n/).length,
            newStart: 1,
            newLines: afterContent.split(/\r?\n/).length,
            preview: `Add task note to ${relativePath}`,
            beforeText: beforeContent,
            afterText: afterContent,
            decision: "accepted"
          }
        ]
      }
    ]
  };

  patchSet.filePatches[0].patchSetId = patchSet.id;
  patchSet.filePatches[0].hunks[0].patchSetId = patchSet.id;
  patchSet.filePatches[0].hunks[0].filePatchId = patchSet.filePatches[0].id;
  return patchSet;
}

export function createSendResult(
  sessionId: string,
  content: string
): {
  session: import("@ai-digital-life/kernel").ConversationSessionRecord;
  userMessage: ConversationMessageRecord;
  assistantMessage: ConversationMessageRecord;
  patchSet: PatchSet | undefined;
} {
  const workspaceId = activeWorkspaceScopeId();
  const userMessage: ConversationMessageRecord = {
    id: `message-user-${Date.now()}`,
    sessionId,
    role: "user",
    content,
    blocks: [],
    createdAt: Date.now()
  };
  const targetPath = content.match(/@([A-Za-z0-9_./-]+)/)?.[1];
  const steps: AgentRunDetail["steps"] = [
    {
      id: `step-${Date.now()}-1`,
      runId: `run-${Date.now()}`,
      title: "理解需求",
      detail: "识别目标文件与补丁边界。",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: `step-${Date.now()}-2`,
      runId: `run-${Date.now()}`,
      title: "生成补丁预览",
      detail: "输出单文件单 hunk 预览。",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: `step-${Date.now()}-3`,
      runId: `run-${Date.now()}`,
      title: "等待应用",
      detail: "保持 Patch First，等待显式应用。",
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
  const newRun: AgentRunDetail = {
    run: {
      id: `run-${Date.now()}`,
      workspaceId,
      sessionId,
      prompt: content,
      scenario: "code-edit",
      status: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    steps
  };
  activeRun = newRun;

  const newPatchSet = targetPath ? createPatchSet(sessionId, targetPath, content) : undefined;
  activePatchSet = newPatchSet;

  const assistantMessage: ConversationMessageRecord = {
    id: `message-assistant-${Date.now()}`,
    sessionId,
    role: "assistant",
    content: targetPath ? `已为 ${targetPath} 生成补丁预览。` : "已生成执行计划。",
    blocks: [
      {
        id: `block-plan-${Date.now()}`,
        type: "plan",
        title: "单 Agent 执行计划",
        items: steps.map((step) => ({
          id: step.id,
          title: step.title,
          detail: step.detail,
          status: step.status
        }))
      },
      ...(newPatchSet
        ? [
            {
              id: `block-patch-${Date.now()}`,
              type: "patch-summary" as const,
              patchSetId: newPatchSet.id,
              summary: newPatchSet.summary,
              fileCount: newPatchSet.filePatches.length,
              hunkCount: newPatchSet.filePatches.reduce((total, filePatch) => total + filePatch.hunks.length, 0)
            }
          ]
        : []),
      {
        id: `block-summary-${Date.now()}`,
        type: "final-summary",
        summary: "当前为浏览器预览 mock，真实桌面环境会走 Tauri Command + Rust/SQLite。"
      }
    ],
    runId: newRun.run.id,
    createdAt: Date.now()
  };

  const sessionMessages = messagesBySession.get(sessionId) ?? [];
  sessionMessages.push(userMessage, assistantMessage);
  messagesBySession.set(sessionId, sessionMessages);
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (session) {
    session.updatedAt = assistantMessage.createdAt;
    session.lastMessageAt = assistantMessage.createdAt;
    session.manualUnread = false;
    session.lastReadAt = assistantMessage.createdAt;
  }

  return {
    session: sessions.find((item) => item.id === sessionId)!,
    userMessage,
    assistantMessage,
    patchSet: newPatchSet
  };
}