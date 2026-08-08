import React from 'react';
import type {
  ConversationMessageRecord,
  ConversationBlock,
  ApprovalConversationBlock,
  PlanConversationBlock,
  ToolCallConversationBlock,
  PatchSummaryConversationBlock,
  ValidationResultConversationBlock,
  FinalSummaryConversationBlock,
  MarkdownConversationBlock,
  ExecutionStepConversationBlock,
  ExecutionSummaryConversationBlock,
  CommandOutputConversationBlock,
} from '@shared/ipc';
import type { CopyDict } from '@i18n';
import { PlanCard, type PlanStep } from '@components/agent/PlanCard';
import { StepBlock } from '@components/agent/StepBlock';
import { ExecutionSummaryCard } from '@components/agent/ExecutionSummary';
import { CommandOutputBlock } from '@components/terminal/CommandOutputBlock';
import { ApprovalInlineCard } from '../../regions/center-pane/ApprovalInlineCard';

function renderPlanBlock(block: PlanConversationBlock, t: CopyDict): React.ReactElement {
  const steps: PlanStep[] = block.items.map((item) => ({
    id: item.id,
    title: item.title,
    stepType:
      item.status === 'running' ? 'analyze' : ((item.status as PlanStep['stepType']) ?? 'analyze'),
    status: item.status,
  }));
  return <PlanCard key={block.id} t={t} title={block.title} steps={steps} />;
}

function renderExecutionStepBlock(
  block: ExecutionStepConversationBlock,
  t: CopyDict,
  onRetryStep?: (stepId: string) => void,
): React.ReactElement {
  return <StepBlock key={block.id} t={t} block={block} onRetry={onRetryStep} />;
}

function renderExecutionSummaryBlock(
  block: ExecutionSummaryConversationBlock,
  t: CopyDict,
  onViewChanges?: () => void,
): React.ReactElement {
  return <ExecutionSummaryCard key={block.id} t={t} block={block} onViewChanges={onViewChanges} />;
}

function renderCommandOutputBlock(
  block: CommandOutputConversationBlock,
  t: CopyDict,
): React.ReactElement {
  return <CommandOutputBlock key={block.id} t={t} block={block} />;
}

function renderPatchSummaryBlock(
  block: PatchSummaryConversationBlock,
  t: CopyDict,
): React.ReactElement {
  return (
    <section key={block.id} className="adl-block adl-block--patch">
      <h4>{t.patch}</h4>
      <p>{block.summary}</p>
      <p>
        {block.fileCount} files / {block.hunkCount} hunks
      </p>
    </section>
  );
}

function renderToolCallBlock(block: ToolCallConversationBlock, t: CopyDict): React.ReactElement {
  return (
    <section key={block.id} className="adl-block adl-block--tool">
      <h4>{t.tool}</h4>
      <p>{block.toolName}</p>
      <p>{block.summary}</p>
      <span className="adl-pill adl-pill--muted">{block.status}</span>
    </section>
  );
}

function renderValidationResultBlock(
  block: ValidationResultConversationBlock,
  t: CopyDict,
): React.ReactElement {
  return (
    <section key={block.id} className="adl-block adl-block--validation">
      <h4>{t.validation}</h4>
      <p>{block.summary}</p>
      <span className="adl-pill adl-pill--muted">{block.status}</span>
      {block.diagnostics.length > 0 ? (
        <ul>
          {block.diagnostics.map((diagnostic) => (
            <li key={diagnostic.id}>
              <strong>{diagnostic.source}</strong>
              <span>{diagnostic.path ? ` ${diagnostic.path}` : ''}</span>
              <span>{diagnostic.line ? `:${diagnostic.line}` : ''}</span>
              <span> {diagnostic.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function renderFinalSummaryBlock(block: FinalSummaryConversationBlock): React.ReactElement {
  return (
    <section key={block.id} className="adl-block adl-block--summary">
      <p>{block.summary}</p>
    </section>
  );
}

function renderApprovalBlock(block: ApprovalConversationBlock): React.ReactElement {
  return (
    <ApprovalInlineCard
      key={block.id}
      approval={{
        id: block.id,
        taskId: block.id,
        title: block.title,
        description: block.summary,
        riskLevel: block.riskLevel,
        impact: [],
        reversible: true,
        createdAt: Date.now(),
      }}
      onDecide={() => {
        /* 历史消息只读：审批决策由 TaskCenter 面板处理，此处不改变会话状态。 */
      }}
    />
  );
}

function renderMarkdownBlock(block: MarkdownConversationBlock): React.ReactElement {
  return (
    <section key={block.id} className="adl-block adl-block--markdown">
      <p>{block.text}</p>
    </section>
  );
}

function renderMessageBlock(
  block: ConversationBlock,
  t: CopyDict,
  onRetryStep?: (stepId: string) => void,
  onViewChanges?: () => void,
): React.ReactElement | null {
  switch (block.type) {
    case 'plan':
      return renderPlanBlock(block, t);
    case 'execution-step':
      return renderExecutionStepBlock(block, t, onRetryStep);
    case 'execution-summary':
      return renderExecutionSummaryBlock(block, t, onViewChanges);
    case 'command-output':
      return renderCommandOutputBlock(block, t);
    case 'patch-summary':
      return renderPatchSummaryBlock(block, t);
    case 'tool-call':
      return renderToolCallBlock(block, t);
    case 'validation-result':
      return renderValidationResultBlock(block, t);
    case 'final-summary':
      return renderFinalSummaryBlock(block);
    case 'markdown':
      return renderMarkdownBlock(block);
    case 'approval':
      return renderApprovalBlock(block);
    default:
      return null;
  }
}

interface MessageBlocksProps {
  message: ConversationMessageRecord;
  t: CopyDict;
  onRetryStep?: (stepId: string) => void;
  onViewChanges?: () => void;
}

export const MessageBlocks = React.memo(function MessageBlocks({
  message,
  t,
  onRetryStep,
  onViewChanges,
}: MessageBlocksProps) {
  return (
    <div className="adl-message-blocks">
      {message.blocks.map((block) => renderMessageBlock(block, t, onRetryStep, onViewChanges))}
    </div>
  );
});
