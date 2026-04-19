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
  type PatchSet,
  type ValidationResult,
  createId
} from "@ai-digital-life/kernel";
import { ModelGateway } from "@ai-digital-life/model-gateway";
import { buildPrompt } from "@ai-digital-life/prompt-engine";
import type { StateRepository } from "@ai-digital-life/storage";

export interface AgentExecutionResult {
  runDetail: AgentRunDetail;
  assistantContent: string;
  assistantBlocks: ConversationBlock[];
  patchSet?: PatchSet;
}

function extractExplicitPaths(prompt: string): string[] {
  return Array.from(prompt.matchAll(/@([A-Za-z0-9_./-]+)/g)).map((match) => match[1]);
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

  async startRun(input: {
    workspaceId: string;
    sessionId: string;
    workspaceRoot: string;
    prompt: string;
    scenario?: ConversationScenario;
  }): Promise<AgentExecutionResult> {
    const runId = createId("run");
    const now = Date.now();
    const scenario = input.scenario ?? "code-edit";

    const run: AgentRunRecord = {
      id: runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      prompt: input.prompt,
      scenario,
      status: "ready",
      createdAt: now,
      updatedAt: now
    };

    const steps = createPlanSteps(runId);
    await this.stateRepository.upsertAgentRun(run);
    await this.stateRepository.replaceAgentSteps(runId, steps);

    const explicitPaths = extractExplicitPaths(input.prompt);
    const contextEntries: ContextEntry[] = explicitPaths.map((relativePath) => ({
      id: createId("ctx"),
      type: "file",
      label: relativePath,
      path: relativePath,
      content: "",
      tokenEstimate: 200
    }));
    const promptText = buildPrompt({
      scenario,
      sessionTitle: `workspace:${path.basename(input.workspaceRoot)}`,
      prompt: input.prompt
    });
    const contextSummary = summarizeContext(selectContextWindow(contextEntries));
    const modelResponse = await this.modelGateway.generateResponse({
      scenario,
      prompt: promptText,
      contextSummary
    });

    let patchSet: PatchSet | undefined;

    if (explicitPaths.length > 0) {
      const relativePath = explicitPaths[0];
      const beforeContent = await this.fsOps.readFile(input.workspaceRoot, relativePath);
      const afterContent = buildPatchContent(input.prompt, beforeContent, modelResponse.content);
      patchSet = this.changeEngine.createSingleHunkPatchSet({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        runId,
        relativePath,
        beforeContent,
        afterContent,
        title: `Update ${relativePath}`,
        summary: `建议在 ${relativePath} 中加入一条由模型生成的任务说明注释。`
      });
      await this.stateRepository.upsertPatchSet(patchSet);
      run.patchSetId = patchSet.id;
      run.summary = `Prepared patch preview for ${relativePath} using ${modelResponse.modelId}.`;
      await this.stateRepository.upsertAgentRun(run);
    }

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
