import React from "react";
import type { ConversationMessageRecord, ConversationBlock } from "@ai-digital-life/kernel";
import type { CopyDict } from "./copy";
import { PlanCard, type PlanStep } from "./components/agent/PlanCard";
import { StepBlock } from "./components/agent/StepBlock";
import { ExecutionSummaryCard } from "./components/agent/ExecutionSummary";
import { CommandOutputBlock } from "./components/terminal/CommandOutputBlock";
import { TokenUsage } from "./components/conversation/TokenUsage";

interface MessageBlockRendererProps<T extends ConversationBlock = ConversationBlock> {
  block: T;
  t: CopyDict;
  onRetryStep?: (stepId: string) => void;
  onViewChanges?: () => void;
}

type MessageBlockRenderer = (props: MessageBlockRendererProps) => React.ReactElement | null;

const messageBlockRegistry = new Map<string, MessageBlockRenderer>();

function registerMessageBlock(type: string, renderer: MessageBlockRenderer): void {
  messageBlockRegistry.set(type, renderer);
}

registerMessageBlock("plan", ({ block, t }) => {
  const steps: PlanStep[] = (block as any).items.map((item: any) => ({
    id: item.id,
    title: item.title,
    stepType: "analyze",
    status: "pending",
  }));
  return <PlanCard key={block.id} t={t} title={(block as any).title} steps={steps} />;
});

registerMessageBlock("execution-step", ({ block, t, onRetryStep }) => {
  return <StepBlock key={block.id} t={t} block={block as any} onRetry={onRetryStep} />;
});

registerMessageBlock("execution-summary", ({ block, t, onViewChanges }) => {
  return <ExecutionSummaryCard key={block.id} t={t} block={block as any} onViewChanges={onViewChanges} />;
});

registerMessageBlock("command-output", ({ block, t }) => {
  return <CommandOutputBlock key={block.id} t={t} block={block as any} />;
});

registerMessageBlock("patch-summary", ({ block }) => {
  const patchBlock = block as any;
  return (
    <section key={block.id} className="adl-block adl-block--patch">
      <h4>Patch</h4>
      <p>{patchBlock.summary}</p>
      <p>
        {patchBlock.fileCount} files / {patchBlock.hunkCount} hunks
      </p>
    </section>
  );
});

registerMessageBlock("tool-call", ({ block }) => {
  const toolBlock = block as any;
  return (
    <section key={block.id} className="adl-block adl-block--tool">
      <h4>Tool</h4>
      <p>{toolBlock.toolName}</p>
      <p>{toolBlock.summary}</p>
      <span className="adl-pill adl-pill--muted">{toolBlock.status}</span>
    </section>
  );
});

registerMessageBlock("validation-result", ({ block }) => {
  const validationBlock = block as any;
  return (
    <section key={block.id} className="adl-block adl-block--validation">
      <h4>Validation</h4>
      <p>{validationBlock.summary}</p>
      <span className="adl-pill adl-pill--muted">{validationBlock.status}</span>
      {validationBlock.diagnostics.length ? (
        <ul>
          {validationBlock.diagnostics.map((diagnostic: any) => (
            <li key={diagnostic.id}>
              <strong>{diagnostic.source}</strong>
              <span>{diagnostic.path ? ` ${diagnostic.path}` : ""}</span>
              <span>{diagnostic.line ? `:${diagnostic.line}` : ""}</span>
              <span> {diagnostic.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
});

registerMessageBlock("final-summary", ({ block }) => {
  const summaryBlock = block as any;
  return (
    <section key={block.id} className="adl-block adl-block--summary">
      <p>{summaryBlock.summary}</p>
    </section>
  );
});

registerMessageBlock("markdown", ({ block }) => {
  const markdownBlock = block as any;
  return (
    <section key={block.id} className="adl-block adl-block--markdown">
      <p>{markdownBlock.text}</p>
    </section>
  );
});

function renderMessageBlock(
  block: ConversationBlock,
  t: CopyDict,
  onRetryStep?: (stepId: string) => void,
  onViewChanges?: () => void
): React.ReactElement | null {
  const renderer = messageBlockRegistry.get(block.type);
  if (renderer) {
    return renderer({ block, t, onRetryStep, onViewChanges });
  }
  return null;
}

interface MessageBlocksProps {
  message: ConversationMessageRecord;
  t: CopyDict;
  onRetryStep?: (stepId: string) => void;
  onViewChanges?: () => void;
}

export function MessageBlocks({ message, t, onRetryStep, onViewChanges }: MessageBlocksProps) {
  return (
    <div className="adl-message-blocks">
      {message.blocks.map((block) => renderMessageBlock(block, t, onRetryStep, onViewChanges))}
    </div>
  );
}
