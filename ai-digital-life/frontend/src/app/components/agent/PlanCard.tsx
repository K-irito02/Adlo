import React, { useState } from "react";
import type { AgentStepType, RiskLevel } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../i18n";
import { IconChevronDown, IconChevronRight, IconTarget } from "../../icons";

export interface PlanStep {
  id: string;
  title: string;
  stepType: AgentStepType;
  riskLevel?: RiskLevel;
  status: "pending" | "running" | "completed" | "failed";
}

interface PlanCardProps {
  t: CopyDict;
  title: string;
  steps: PlanStep[];
  expanded?: boolean;
}

const STEP_TYPE_ICON: Record<AgentStepType, string> = {
  analyze: "🔍",
  search: "🔎",
  read: "📖",
  edit: "✏️",
  command: "⌨️",
  verify: "✅",
};

function stepTypeLabel(t: CopyDict, type: AgentStepType): string {
  const map: Record<AgentStepType, keyof CopyDict> = {
    analyze: "stepTypeAnalyze",
    search: "stepTypeSearch",
    read: "stepTypeRead",
    edit: "stepTypeEdit",
    command: "stepTypeCommand",
    verify: "stepTypeVerify",
  };
  return t[map[type]] as string;
}

function riskClass(level?: RiskLevel): string {
  if (!level) return "";
  return ` adl-plan-card__risk--${level}`;
}

function statusClass(status: PlanStep["status"]): string {
  return `adl-plan-card__step--${status}`;
}

export function PlanCard({ t, title, steps, expanded: initialExpanded = true }: PlanCardProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const completed = steps.filter((s) => s.status === "completed").length;

  return (
    <section className="adl-plan-card">
      <header className="adl-plan-card__header" role="button" tabIndex={0} onClick={() => setExpanded((v) => !v)} onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}>
        <IconTarget size={16} decorative />
        <h4 className="adl-plan-card__title">{title || t.planCardTitle}</h4>
        <span className="adl-plan-card__progress">
          {t.planProgress}: {completed}/{steps.length}
        </span>
        {expanded ? <IconChevronDown size={14} decorative /> : <IconChevronRight size={14} decorative />}
      </header>
      {expanded && (
        <ol className="adl-plan-card__steps">
          {steps.map((step, idx) => (
            <li key={step.id} className={`adl-plan-card__step ${statusClass(step.status)}`}>
              <span className="adl-plan-card__step-num">{idx + 1}</span>
              <span className="adl-plan-card__step-icon" aria-hidden="true">{STEP_TYPE_ICON[step.stepType]}</span>
              <span className="adl-plan-card__step-title">{step.title}</span>
              <span className="adl-chip adl-chip--xs adl-chip--muted">{stepTypeLabel(t, step.stepType)}</span>
              {step.riskLevel && step.riskLevel !== "low" && (
                <span className={`adl-chip adl-chip--xs${riskClass(step.riskLevel)}`}>
                  {step.riskLevel}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
