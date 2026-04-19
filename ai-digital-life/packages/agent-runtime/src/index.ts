import path from "node:path";
import { ChangeEngine } from "@ai-digital-life/change-engine";
import { selectContextWindow, summarizeContext } from "@ai-digital-life/context-engine";
import { WorkspaceFsService } from "@ai-digital-life/fs-ops";
import {
  type AgentPlanStep,
  type AgentRunDetail,
  type AgentRunRecord,
  type ConfigSnapshot,
  type ContextEntry,
  type ConversationBlock,
  type ConversationScenario,
  type DiagnosticSummary,
  type ModelResponse,
  type PatchSet,
  type ValidationResult,
  createId
} from "@ai-digital-life/kernel";
import { ModelGateway } from "@ai-digital-life/model-gateway";
import { assemblePromptBundle, rememberPromptVersion, wrapUntrustedReference } from "@ai-digital-life/prompt-engine";
import type { StateRepository } from "@ai-digital-life/storage";

export interface AgentExecutionResult {
  runDetail: AgentRunDetail;
  assistantContent: string;
  assistantBlocks: ConversationBlock[];
  patchSet?: PatchSet;
}

/** Prepared DB state + prompt construction before any model IO. */
export interface AgentRunBootstrap {
  run: AgentRunRecord;
  steps: AgentPlanStep[];
  promptText: string;
  contextSummary: string;
  scenario: ConversationScenario;
  explicitPaths: string[];
  workspaceRoot: string;
  workspaceId: string;
  sessionId: string;
  userFacingPrompt: string;
}

function extractFileMarkers(prompt: string): string[] {
  const unique = new Set<string>();
  for (const match of prompt.matchAll(/@(?:file:)?([A-Za-z0-9_./-]+)/g)) {
    unique.add(match[1]);
  }
  return [...unique];
}

function extractSymbolName(prompt: string): string | undefined {
  const match = /@symbol:([A-Za-z0-9_]+)/.exec(prompt);
  return match?.[1];
}

function createPlanSteps(runId: string): AgentPlanStep[] {
  const now = Date.now();
  return [
    {
      id: createId("step"),
      runId,
      title: "理解用户请求",
      detail: "解析目标文件、工作区上下文和预期变更。",
      status: "completed",
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("step"),
      runId,
      title: "生成补丁方案",
      detail: "输出 Patch First 预览，等待用户确认。",
      status: "completed",
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("step"),
      runId,
      title: "应用前验证",
      detail: "在后续 tranche 中补入结构化验证命令。",
      status: "pending",
      createdAt: now,
      updatedAt: now
    }
  ];
}

function deriveCommentText(prompt: string, modelContent: string): string {
  const firstUsefulLine =
    modelContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("```") && !line.startsWith("//") && !line.startsWith("+")) ??
    prompt.replace(/\s+/g, " ").trim();

  return firstUsefulLine
    .replace(/^[-*]\s*/, "")
    .replace(/[。；;,.]+$/, "")
    .slice(0, 80);
}

function buildPatchContent(prompt: string, beforeContent: string, modelContent: string): string {
  const note = `// AI Digital Life: ${deriveCommentText(prompt, modelContent)}`;
  if (beforeContent.includes(note)) {
    return beforeContent;
  }
  if (beforeContent.startsWith("// AI Digital Life: ")) {
    const [, ...restLines] = beforeContent.split(/\r?\n/);
    return `${note}\n${restLines.join("\n")}`.replace(/\n+$/, "\n");
  }
  return `${note}\n${beforeContent}`;
}

function formatDiagnostics(diagnostics: DiagnosticSummary[]): string {
  return diagnostics
    .map((diagnostic) =>
      [
        diagnostic.source,
        diagnostic.path ? ` ${diagnostic.path}` : "",
        diagnostic.line ? `:${diagnostic.line}` : "",
        ` ${diagnostic.message}`
      ].join("")
    )
    .join("\n");
}

export class AgentRuntimeService {
  private readonly fsOps = new WorkspaceFsService();
  private readonly modelGateway: ModelGateway;
  private readonly changeEngine = new ChangeEngine(this.fsOps);

  constructor(
    private readonly stateRepository: StateRepository,
    options?: {
      modelGateway?: ModelGateway;
      providerPreferences?: ConfigSnapshot["modelPreferences"]["providers"];
    }
  ) {
    this.modelGateway = options?.modelGateway ?? new ModelGateway({ providerPreferences: options?.providerPreferences });
  }

  private async buildContextEntries(input: {
    workspaceRoot: string;
    workspaceId: string;
    prompt: string;
  }): Promise<ContextEntry[]> {
    const entries: ContextEntry[] = [];
    const markers = extractFileMarkers(input.prompt);
    for (const relativePath of markers) {
      try {
        const content = await this.fsOps.readFile(input.workspaceRoot, relativePath);
        entries.push({
          id: createId("ctx"),
          type: "file",
          label: relativePath,
          path: relativePath,
          content,
          tokenEstimate: Math.max(120, Math.ceil(content.length / 4))
        });
      } catch {
        entries.push({
          id: createId("ctx"),
          type: "file",
          label: relativePath,
          path: relativePath,
          content: "(file not readable)",
          tokenEstimate: 80
        });
      }
    }

    const symbol = extractSymbolName(input.prompt);
    if (symbol) {
      const scanFiles =
        markers.length > 0
          ? markers
          : (await this.fsOps.listFiles(input.workspaceRoot)).filter((p) => /\.(ts|tsx|js|jsx|md)$/.test(p)).slice(0, 60);
      const hits: string[] = [];
      for (const filePath of scanFiles) {
        const outline = await this.fsOps.outline(input.workspaceRoot, filePath);
        if (outline.some((item) => item.label === symbol)) {
          hits.push(filePath);
          if (hits.length >= 3) {
            break;
          }
        }
      }
      const summary = hits.length
        ? `Symbol "${symbol}" matched in: ${hits.join(", ")}`
        : `Symbol "${symbol}" not found in scanned outlines.`;
      entries.push({
        id: createId("ctx"),
        type: "outline",
        label: `symbol:${symbol}`,
        content: summary,
        tokenEstimate: Math.max(80, summary.length / 4)
      });
    }

    if (/@terminal:last\b/.test(input.prompt)) {
      const latest = await this.stateRepository.getLatestCommandRequest(input.workspaceId);
      const summary = latest
        ? `terminal: ${latest.command} ${latest.args.join(" ")} (profile ${latest.profile}, risk ${latest.riskLevel})`
        : "terminal: (no recorded commands for this workspace yet)";
      entries.push({
        id: createId("ctx"),
        type: "message",
        label: "terminal:last",
        content: wrapUntrustedReference("last-command", summary),
        tokenEstimate: Math.max(60, summary.length / 4)
      });
    }

    return entries;
  }

  async prepareAgentRun(input: {
    workspaceId: string;
    sessionId: string;
    workspaceRoot: string;
    prompt: string;
    scenario?: ConversationScenario;
  }): Promise<AgentRunBootstrap> {
    const runId = createId("run");
    const now = Date.now();
    const scenario = input.scenario ?? "code-edit";

    const run: AgentRunRecord = {
      id: runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      prompt: input.prompt,
      scenario,
      status: "planning",
      createdAt: now,
      updatedAt: now
    };

    const steps = createPlanSteps(runId);
    await this.stateRepository.upsertAgentRun(run);
    await this.stateRepository.replaceAgentSteps(runId, steps);

    const explicitPaths = extractFileMarkers(input.prompt);
    const contextEntries = await this.buildContextEntries({
      workspaceRoot: input.workspaceRoot,
      workspaceId: input.workspaceId,
      prompt: input.prompt
    });
    const bundle = assemblePromptBundle({
      scenario,
      sessionTitle: `workspace:${path.basename(input.workspaceRoot)}`,
      prompt: input.prompt
    });
    rememberPromptVersion(input.workspaceId, bundle.versionId, bundle.finalText);
    const promptText = bundle.finalText;
    const contextSummary = summarizeContext(selectContextWindow(contextEntries));

    return {
      run,
      steps,
      promptText,
      contextSummary,
      scenario,
      explicitPaths,
      workspaceRoot: input.workspaceRoot,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      userFacingPrompt: input.prompt
    };
  }

  async completeAgentRunWithModelResponse(
    bootstrap: AgentRunBootstrap,
    modelResponse: ModelResponse
  ): Promise<AgentExecutionResult> {
    const run = { ...bootstrap.run, updatedAt: Date.now(), status: "ready" as const };
    const { steps } = bootstrap;
    let patchSet: PatchSet | undefined;

    if (bootstrap.explicitPaths.length > 0) {
      const relativePath = bootstrap.explicitPaths[0];
      const beforeContent = await this.fsOps.readFile(bootstrap.workspaceRoot, relativePath);
      const afterContent = buildPatchContent(bootstrap.userFacingPrompt, beforeContent, modelResponse.content);
      patchSet = this.changeEngine.createSingleHunkPatchSet({
        workspaceId: bootstrap.workspaceId,
        sessionId: bootstrap.sessionId,
        runId: run.id,
        relativePath,
        beforeContent,
        afterContent,
        title: `Update ${relativePath}`,
        summary: `建议在 ${relativePath} 中加入一条由模型生成的任务说明注释。`
      });
      await this.stateRepository.upsertPatchSet(patchSet);
      run.patchSetId = patchSet.id;
      run.summary = `Prepared patch preview for ${relativePath} using ${modelResponse.modelId}.`;
    }

    await this.stateRepository.upsertAgentRun(run);

    const assistantBlocks: ConversationBlock[] = [
      {
        id: createId("block"),
        type: "plan",
        title: "单 Agent 执行计划",
        items: steps.map((step) => ({
          id: step.id,
          title: step.title,
          detail: step.detail,
          status: step.status
        }))
      }
    ];

    if (patchSet) {
      assistantBlocks.push({
        id: createId("block"),
        type: "patch-summary",
        patchSetId: patchSet.id,
        summary: patchSet.summary,
        fileCount: patchSet.filePatches.length,
        hunkCount: patchSet.filePatches.reduce((total, filePatch) => total + filePatch.hunks.length, 0)
      });
    }

    assistantBlocks.push({
      id: createId("block"),
      type: "final-summary",
      summary: modelResponse.synthetic
        ? "已生成本地合成计划与补丁预览；接入真实模型后可替换为在线推理。"
        : "已生成计划与补丁预览。"
    });

    return {
      runDetail: {
        run,
        steps
      },
      assistantContent: modelResponse.content,
      assistantBlocks,
      patchSet
    };
  }

  async startRun(input: {
    workspaceId: string;
    sessionId: string;
    workspaceRoot: string;
    prompt: string;
    scenario?: ConversationScenario;
  }): Promise<AgentExecutionResult> {
    const bootstrap = await this.prepareAgentRun(input);
    await this.stateRepository.upsertAgentRun({
      ...bootstrap.run,
      status: "executing",
      updatedAt: Date.now()
    });
    const modelResponse = await this.modelGateway.generateResponse({
      scenario: bootstrap.scenario,
      prompt: bootstrap.promptText,
      contextSummary: bootstrap.contextSummary
    });
    return this.completeAgentRunWithModelResponse(bootstrap, modelResponse);
  }

  async getRun(runId: string): Promise<AgentRunDetail | undefined> {
    return this.stateRepository.getAgentRunDetail(runId);
  }

  async startRepairRun(input: {
    workspaceId: string;
    sessionId: string;
    workspaceRoot: string;
    failedPatchSet: PatchSet;
    validation: ValidationResult;
  }): Promise<AgentExecutionResult | undefined> {
    const relativePath =
      input.validation.diagnostics.find((diagnostic) => diagnostic.path)?.path ??
      input.failedPatchSet.filePatches[0]?.relativePath;

    if (!relativePath) {
      return undefined;
    }

    const normalizedPath = relativePath.replace(/\\/g, "/");
    const prompt = [
      `请根据以下验证失败信息修复 @${normalizedPath}`,
      `验证摘要: ${input.validation.summary}`,
      input.validation.diagnostics.length ? `诊断:\n${formatDiagnostics(input.validation.diagnostics)}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await this.startRun({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot,
      prompt,
      scenario: "code-edit"
    });

    if (result.patchSet) {
      result.patchSet = {
        ...result.patchSet,
        summary: `已根据验证失败信息为 ${normalizedPath} 生成一轮自动修复预览。`
      };
      await this.stateRepository.upsertPatchSet(result.patchSet);
    }

    result.assistantBlocks = [
      ...result.assistantBlocks,
      {
        id: createId("block"),
        type: "final-summary",
        summary: "验证失败后已自动生成一轮修复预览，请检查后再决定是否应用。"
      }
    ];

    return result;
  }
}
