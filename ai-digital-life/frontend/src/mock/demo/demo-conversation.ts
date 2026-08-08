import type {
  AgentRunDetail,
  ConversationDetail,
  ConversationMessageRecord,
  ConversationSendResult,
  ConversationSessionRecord,
  ExecutionStepConversationBlock,
} from '@ai-digital-life/kernel';
import {
  DEMO_NOW,
  DEMO_SESSION_IDS,
  DEMO_SESSION_TITLE_MARKERS,
  DEMO_WORKSPACE_ID,
} from './demo-constants';
import { buildDemoPatchSet, getDemoPatchSet } from './demo-workspace';
import { DEMO_RUN_IDS } from './demo-run-activity';

function session(id: string, title: string, order: number): ConversationSessionRecord {
  return {
    id,
    workspaceId: DEMO_WORKSPACE_ID,
    title,
    status: 'active',
    isPinned: true,
    pinnedOrder: order,
    unpinnedOrder: 0,
    manualUnread: false,
    lastReadAt: DEMO_NOW,
    archivedAt: undefined,
    titleUpdatedAt: DEMO_NOW,
    createdAt: DEMO_NOW - 120_000,
    updatedAt: DEMO_NOW,
    lastMessageAt: DEMO_NOW,
  };
}

function msg(
  id: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  blocks: ConversationMessageRecord['blocks'],
  runId?: string,
  createdAt?: number,
): ConversationMessageRecord {
  return { id, sessionId, role, content, blocks, runId, createdAt: createdAt ?? DEMO_NOW };
}

// ── 综合演示：单 Agent 代码修改流程 ──────────────────────────
const completeSession = session(DEMO_SESSION_IDS.complete, DEMO_SESSION_TITLE_MARKERS.complete, 0);

const completeMessages: ConversationMessageRecord[] = [
  msg(
    'demo-msg-complete-user',
    completeSession.id,
    'user',
    '请帮我在 main.tsx 顶部加入项目说明注释，并运行 lint 验证。',
    [],
    undefined,
    DEMO_NOW - 60_000,
  ),
  msg(
    'demo-msg-complete-assistant',
    completeSession.id,
    'assistant',
    '已生成计划并完成修改。',
    [
      { id: 'demo-block-complete-plan', type: 'plan', title: '代码修改执行计划', items: [
        { id: 'plan-step-analyze', title: '分析入口文件', detail: '识别 main.tsx 结构', status: 'completed' },
        { id: 'plan-step-search', title: '检索 createRoot 引用', status: 'completed' },
        { id: 'plan-step-read', title: '读取目标文件', status: 'completed' },
        { id: 'plan-step-edit', title: '添加注释', detail: '在顶部插入说明', status: 'completed' },
        { id: 'plan-step-command', title: '运行 lint', status: 'completed' },
        { id: 'plan-step-verify', title: '验证通过', status: 'completed' },
      ] },
      { id: 'demo-block-complete-tool1', type: 'tool-call', toolName: 'webSearch', summary: '搜索 createRoot 用法', status: 'completed' },
      { id: 'demo-block-complete-tool2', type: 'tool-call', toolName: 'webFetch', summary: '获取 React 官方文档', status: 'completed' },
      { id: 'demo-block-complete-tool3', type: 'tool-call', toolName: 'readFile', summary: '读取 frontend/src/main.tsx', status: 'completed' },
      {
        id: 'demo-block-complete-step1', type: 'execution-step', stepId: 'demo-step-1',
        title: '读取入口文件', stepType: 'read', status: 'completed', summary: '读取 512 字节', riskLevel: 'low',
        toolCalls: [{ id: 'demo-tool-read', toolName: 'readFile', inputSummary: 'main.tsx', outputSummary: '512 bytes', status: 'completed' }],
      },
      {
        id: 'demo-block-complete-step2', type: 'execution-step', stepId: 'demo-step-2',
        title: '修改文件', stepType: 'edit', status: 'completed', summary: '插入 1 行注释', riskLevel: 'medium',
        toolCalls: [{ id: 'demo-tool-edit', toolName: 'editFile', inputSummary: '顶部插入注释', status: 'completed' }],
      },
      {
        id: 'demo-block-complete-step3', type: 'execution-step', stepId: 'demo-step-3',
        title: '运行 lint', stepType: 'command', status: 'completed', summary: 'exit 0', riskLevel: 'high',
        toolCalls: [{ id: 'demo-tool-lint', toolName: 'command', inputSummary: 'npm run lint', outputSummary: '0 errors', status: 'completed' }],
      },
      {
        id: 'demo-block-complete-step4', type: 'execution-step', stepId: 'demo-step-4',
        title: '验证构建', stepType: 'verify', status: 'failed', summary: 'tsc 报错', error: 'TS6133: 未使用变量',
        toolCalls: [{ id: 'demo-tool-tsc', toolName: 'command', inputSummary: 'npx tsc --noEmit', outputSummary: '1 error', status: 'failed' }],
      },
      { id: 'demo-block-complete-cmd1', type: 'command-output', command: 'npm', args: ['run', 'lint'], exitCode: 0, stdout: 'All files pass lint.\n', stderr: '', truncated: false },
      { id: 'demo-block-complete-cmd2', type: 'command-output', command: 'npx', args: ['tsc', '--noEmit'], exitCode: 1, stdout: '', stderr: 'error TS6133: "foo" is declared but never read.\n', truncated: false },
      { id: 'demo-block-complete-patch', type: 'patch-summary', patchSetId: 'patchset-demo-complete', summary: '在 main.tsx 顶部加入项目说明注释。', fileCount: 1, hunkCount: 1 },
      {
        id: 'demo-block-complete-validation', type: 'validation-result', summary: '类型检查 2 项，1 项未通过', status: 'failed',
        diagnostics: [
          { id: 'diag-1', source: 'typescript', severity: 'error', message: '"foo" 声明后未使用', path: 'frontend/src/main.tsx', line: 2, column: 5 },
          { id: 'diag-2', source: 'eslint', severity: 'warning', message: '建议使用 const', path: 'frontend/src/main.tsx', line: 5 },
        ],
      },
      {
        id: 'demo-block-complete-exec-summary', type: 'execution-summary', status: 'succeeded',
        filesModified: ['frontend/src/main.tsx'],
        commandsExecuted: ['npm run lint', 'npx tsc --noEmit'],
        validationPassed: 1,
        validationFailed: 0,
        tokenUsage: { promptTokens: 1200, completionTokens: 480, totalTokens: 1680 },
      },
      { id: 'demo-block-complete-final', type: 'final-summary', summary: '已完成 main.tsx 的注释添加，lint 通过，构建验证成功。' },
    ],
    DEMO_RUN_IDS.complete,
    DEMO_NOW - 55_000,
  ),
];

// ── 计划与审批：plan 场景 + 审批流 ──────────────────────────
const planSession = session(DEMO_SESSION_IDS.plan, DEMO_SESSION_TITLE_MARKERS.plan, 1);

const planMessages: ConversationMessageRecord[] = [
  msg(
    'demo-msg-plan-user',
    planSession.id,
    'user',
    '规划一个重构方案：把 App.tsx 的渲染逻辑拆分到独立组件。',
    [],
    undefined,
    DEMO_NOW - 95_000,
  ),
  msg(
    'demo-msg-plan-assistant',
    planSession.id,
    'assistant',
    '方案已规划，但审批被拒绝，已回滚。',
    [
      { id: 'demo-block-plan-plan', type: 'plan', title: '重构执行计划', items: [
        { id: 'plan-p-analyze', title: '分析渲染逻辑', status: 'pending' },
        { id: 'plan-p-search', title: '定位依赖', status: 'pending' },
        { id: 'plan-p-read', title: '读取 App.tsx', status: 'completed' },
        { id: 'plan-p-edit', title: '拆分为 Header/Footer', status: 'pending' },
        { id: 'plan-p-command', title: '运行测试', status: 'pending' },
        { id: 'plan-p-verify', title: '验收', status: 'pending' },
      ] },
      { id: 'demo-block-plan-approval-low', type: 'approval', title: '创建 Header 组件', riskLevel: 'low', summary: '新增组件文件，可逆。' },
      { id: 'demo-block-plan-approval-medium', type: 'approval', title: '修改 App.tsx 引入方式', riskLevel: 'medium', summary: '改动公共入口，影响面中等。' },
      { id: 'demo-block-plan-approval-high', type: 'approval', title: '删除旧渲染函数', riskLevel: 'high', summary: '删除代码不可恢复，需审批。' },
      {
        id: 'demo-block-plan-validation', type: 'validation-result', summary: '重构校验失败：旧渲染函数仍被引用', status: 'failed',
        diagnostics: [
          { id: 'diag-plan-1', source: 'typescript', severity: 'error', message: '找不到旧渲染函数', path: 'frontend/src/app/App.tsx', line: 12 },
        ],
      },
      {
        id: 'demo-block-plan-exec-summary', type: 'execution-summary', status: 'rolled-back',
        filesModified: [],
        commandsExecuted: [],
        rollbackReason: '审批被拒绝，所有变更已回滚。',
        tokenUsage: { promptTokens: 900, completionTokens: 150, totalTokens: 1050 },
      },
      { id: 'demo-block-plan-final', type: 'final-summary', summary: '重构未执行：用户拒绝了高风险审批。' },
    ],
    DEMO_RUN_IDS.plan,
    DEMO_NOW - 90_000,
  ),
];

// ── 搜索与工具：chat 场景 + 网络搜索 ─────────────────────────
const toolsSession = session(DEMO_SESSION_IDS.tools, DEMO_SESSION_TITLE_MARKERS.tools, 2);

const toolsMessages: ConversationMessageRecord[] = [
  msg(
    'demo-msg-tools-user',
    toolsSession.id,
    'user',
    '请搜索 Rust 异步编程的最佳实践，并检查当前 git 状态。',
    [],
    undefined,
    DEMO_NOW - 35_000,
  ),
  msg(
    'demo-msg-tools-assistant',
    toolsSession.id,
    'assistant',
    '已汇总搜索结果为 markdown 答复。',
    [
      { id: 'demo-block-tools-md', type: 'markdown', text: '## Rust 异步最佳实践\n\n- 优先使用 tokio。\n- 避免阻塞调用。\n- 合理拆分任务。' },
      { id: 'demo-block-tools-tool1', type: 'tool-call', toolName: 'webSearch', summary: 'rust async best practices，命中 3 条', status: 'completed' },
      { id: 'demo-block-tools-cmd', type: 'command-output', command: 'git', args: ['status'], exitCode: 0, stdout: 'On branch main\nChanges not staged:\n  frontend/src/main.tsx\n', stderr: '', truncated: false },
      {
        id: 'demo-block-tools-validation', type: 'validation-result', summary: '验证工具输出', status: 'passed',
        diagnostics: [],
      },
      {
        id: 'demo-block-tools-exec-summary', type: 'execution-summary', status: 'succeeded',
        filesModified: [],
        commandsExecuted: ['git status'],
        validationPassed: 1,
        validationFailed: 0,
        tokenUsage: { promptTokens: 700, completionTokens: 320, totalTokens: 1020 },
      },
    ],
    DEMO_RUN_IDS.tools,
    DEMO_NOW - 30_000,
  ),
];

const messagesBySession = new Map<string, ConversationMessageRecord[]>([
  [completeSession.id, completeMessages],
  [planSession.id, planMessages],
  [toolsSession.id, toolsMessages],
]);

const demoSessions = [completeSession, planSession, toolsSession];

const demoRunDetails = new Map<string, AgentRunDetail>([
  [
    DEMO_RUN_IDS.complete,
    {
      run: {
        id: DEMO_RUN_IDS.complete,
        workspaceId: DEMO_WORKSPACE_ID,
        sessionId: completeSession.id,
        prompt: completeMessages[0].content,
        scenario: 'code-edit',
        status: 'succeeded',
        summary: '已完成注释添加与验证。',
        patchSetId: 'patchset-demo-complete',
        createdAt: DEMO_NOW - 60_000,
        updatedAt: DEMO_NOW - 55_000,
        completedAt: DEMO_NOW - 54_000,
      },
      steps: [
        { id: 'plan-step-analyze', runId: DEMO_RUN_IDS.complete, title: '分析入口文件', status: 'completed', createdAt: DEMO_NOW - 59_000, updatedAt: DEMO_NOW - 58_000 },
        { id: 'plan-step-edit', runId: DEMO_RUN_IDS.complete, title: '添加注释', status: 'completed', createdAt: DEMO_NOW - 57_000, updatedAt: DEMO_NOW - 56_000 },
      ],
    },
  ],
  [
    DEMO_RUN_IDS.plan,
    {
      run: {
        id: DEMO_RUN_IDS.plan,
        workspaceId: DEMO_WORKSPACE_ID,
        sessionId: planSession.id,
        prompt: planMessages[0].content,
        scenario: 'plan',
        status: 'rolled-back',
        summary: '审批被拒绝，已回滚。',
        patchSetId: 'patchset-demo-plan',
        createdAt: DEMO_NOW - 95_000,
        updatedAt: DEMO_NOW - 90_000,
        completedAt: DEMO_NOW - 89_000,
      },
      steps: [
        { id: 'plan-p-read', runId: DEMO_RUN_IDS.plan, title: '读取 App.tsx', status: 'completed', createdAt: DEMO_NOW - 92_000, updatedAt: DEMO_NOW - 91_000 },
        { id: 'plan-p-edit', runId: DEMO_RUN_IDS.plan, title: '拆分为组件', status: 'failed', createdAt: DEMO_NOW - 91_000, updatedAt: DEMO_NOW - 90_000 },
      ],
    },
  ],
  [
    DEMO_RUN_IDS.tools,
    {
      run: {
        id: DEMO_RUN_IDS.tools,
        workspaceId: DEMO_WORKSPACE_ID,
        sessionId: toolsSession.id,
        prompt: toolsMessages[0].content,
        scenario: 'chat',
        status: 'succeeded',
        summary: '已完成搜索并给出答复。',
        createdAt: DEMO_NOW - 35_000,
        updatedAt: DEMO_NOW - 30_000,
        completedAt: DEMO_NOW - 29_000,
      },
      steps: [],
    },
  ],
]);

export function getDemoSessions(): ConversationSessionRecord[] {
  return demoSessions;
}

export function getDemoSessionDetail(sessionId: string): ConversationDetail | undefined {
  const session = demoSessions.find((s) => s.id === sessionId);
  if (!session) {
    return undefined;
  }
  return { session, messages: messagesBySession.get(sessionId) ?? [] };
}

export function getDemoRunDetail(runId: string): AgentRunDetail | undefined {
  return demoRunDetails.get(runId);
}

export function appendDemoUserMessage(sessionId: string, content: string): void {
  const list = messagesBySession.get(sessionId);
  if (!list) {
    return;
  }
  const message = msg(`demo-msg-user-${Date.now()}`, sessionId, 'user', content, []);
  list.push(message);
  messagesBySession.set(sessionId, list);
  const session = demoSessions.find((s) => s.id === sessionId);
  if (session) {
    session.updatedAt = Date.now();
    session.lastMessageAt = Date.now();
    session.manualUnread = false;
    session.lastReadAt = Date.now();
  }
}

export function appendDemoAssistantMessage(
  sessionId: string,
  message: ConversationMessageRecord,
): void {
  const list = messagesBySession.get(sessionId) ?? [];
  list.push(message);
  messagesBySession.set(sessionId, list);
  const session = demoSessions.find((s) => s.id === sessionId);
  if (session) {
    session.updatedAt = message.createdAt;
    session.lastMessageAt = message.createdAt;
    session.manualUnread = false;
    session.lastReadAt = message.createdAt;
  }
}

export function buildDemoSendResult(
  sessionId: string,
  content: string,
): ConversationSendResult {
  const session = demoSessions.find((s) => s.id === sessionId)!;
  const runId = `run-demo-${Date.now()}`;
  const userMessage: ConversationMessageRecord = {
    id: `demo-msg-user-${Date.now()}`,
    sessionId,
    role: 'user',
    content,
    blocks: [],
    createdAt: Date.now(),
  };
  const assistantMessage: ConversationMessageRecord = {
    id: `demo-msg-assistant-${Date.now()}`,
    sessionId,
    role: 'assistant',
    content: '已生成演示回复。',
    blocks: [{ id: `demo-block-md-${Date.now()}`, type: 'markdown', text: '这是流式模拟生成的演示回复。' }],
    runId,
    createdAt: Date.now(),
  };
  const runDetail: AgentRunDetail = {
    run: {
      id: runId,
      workspaceId: DEMO_WORKSPACE_ID,
      sessionId,
      prompt: content,
      scenario: 'chat',
      status: 'succeeded',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
    },
    steps: [],
  };
  return {
    session,
    userMessage,
    assistantMessage,
    runDetail,
    patchSet: undefined,
  };
}

export function resetDemoConversation(): void {
  messagesBySession.clear();
  messagesBySession.set(completeSession.id, completeMessages);
  messagesBySession.set(planSession.id, planMessages);
  messagesBySession.set(toolsSession.id, toolsMessages);
}
