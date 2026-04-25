import React from "react";
import type { ConversationMessageRecord } from "@ai-digital-life/kernel";
import type { CopyDict } from "./copy";
import { PlanCard, type PlanStep } from "./components/agent/PlanCard";
import { StepBlock } from "./components/agent/StepBlock";
import { ExecutionSummaryCard } from "./components/agent/ExecutionSummary";
import { CommandOutputBlock } from "./components/terminal/CommandOutputBlock";
import { TokenUsage } from "./components/conversation/TokenUsage";

interface MessageBlocksProps {
  message: ConversationMessageRecord;
  t: CopyDict;
  onRetryStep?: (stepId: string) => void;
  onViewChanges?: () => void;
}

export function MessageBlocks({ message, t, onRetryStep, onViewChanges }: MessageBlocksProps) {
  return (
    <div className="adl-message-blocks">
      {message.blocks.map((block) => {
        if (block.type === "plan") {
          const steps: PlanStep[] = block.items.map((item) => ({
            id: item.id,
            title: item.title,
            stepType: "analyze",
            status: "pending",
          }));
          return <PlanCard key={block.id} t={t} title={block.title} steps={steps} />;
        }

        if (block.type === "execution-step") {
          return <StepBlock key={block.id} t={t} block={block} onRetry={onRetryStep} />;
        }

        if (block.type === "execution-summary") {
          return <ExecutionSummaryCard key={block.id} t={t} block={block} onViewChanges={onViewChanges} />;
        }

        if (block.type === "command-output") {
          return <CommandOutputBlock key={block.id} t={t} block={block} />;
        }

        if (block.type === "patch-summary") {
          return (
            <section key={block.id} className="adl-block adl-block--patch">
              <h4>Patch</h4>
              <p>{block.summary}</p>
              <p>
                {block.fileCount} files / {block.hunkCount} hunks
              </p>
            </section>
          );
        }

        if (block.type === "tool-call") {
          return (
            <section key={block.id} className="adl-block adl-block--tool">
              <h4>Tool</h4>
              <p>{block.toolName}</p>
              <p>{block.summary}</p>
              <span className="adl-pill adl-pill--muted">{block.status}</span>
            </section>
          );
        }

        if (block.type === "validation-result") {
          return (
            <section key={block.id} className="adl-block adl-block--validation">
              <h4>Validation</h4>
              <p>{block.summary}</p>
              <span className="adl-pill adl-pill--muted">{block.status}</span>
              {block.diagnostics.length ? (
                <ul>
                  {block.diagnostics.map((diagnostic) => (
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
        }

        if (block.type === "final-summary") {
          return (
            <section key={block.id} className="adl-block adl-block--summary">
              <p>{block.summary}</p>
            </section>
          );
        }

        if (block.type === "markdown") {
          return (
            <section key={block.id} className="adl-block adl-block--markdown">
              <p>{block.text}</p>
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}
