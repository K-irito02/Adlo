import { createHash } from "node:crypto";
import type { ConversationScenario, PromptRule } from "@ai-digital-life/kernel";

const DEFAULT_RULES: PromptRule[] = [
  {
    id: "platform",
    kind: "platform",
    content: "You are operating inside AI Digital Life desktop with a patch-first workflow."
  },
  {
    id: "project",
    kind: "project",
    content: "Prefer focused edits, explicit plans, and auditable output."
  },
  {
    id: "tool-contract",
    kind: "tool-contract",
    content: "File access and patch application stay behind structured tools."
  },
  {
    id: "output-contract",
    kind: "output-contract",
    content: "Return concise plans and patch-oriented summaries."
  }
];

const REFERENCE_OPEN = "<<<REFERENCE";
const REFERENCE_CLOSE = "REFERENCE>>>";

export interface PromptLayerSnapshot {
  kind: PromptRule["kind"];
  content: string;
}

export interface AssembledPrompt {
  versionId: string;
  scene: ConversationScenario;
  layers: PromptLayerSnapshot[];
  finalText: string;
  contentHash: string;
}

export function wrapUntrustedReference(label: string, body: string): string {
  const normalized = body.replaceAll(REFERENCE_OPEN, "\\<<<REFERENCE").replaceAll(REFERENCE_CLOSE, "REFERENCE\\>>>");
  return `${REFERENCE_OPEN} ${label}\n${normalized}\n${REFERENCE_CLOSE}`;
}

export function detectInjectionSignals(text: string): string[] {
  const findings: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\[\/\s*system\s*]/i, "forged closing system tag"],
    [/\[SYSTEM\]/i, "bracketed SYSTEM marker"],
    [/\bignore previous instructions\b/i, "instruction override phrase"],
    [/\bdisregard\b.*\brules?\b/i, "disregard rules phrase"]
  ];
  for (const [regex, label] of patterns) {
    if (regex.test(text)) {
      findings.push(label);
    }
  }
  return findings;
}

export function buildPrompt(input: {
  scenario: ConversationScenario;
  sessionTitle: string;
  prompt: string;
  extraRules?: PromptRule[];
}): string {
  return assemblePromptBundle(input).finalText;
}

export function assemblePromptBundle(input: {
  scenario: ConversationScenario;
  sessionTitle: string;
  prompt: string;
  extraRules?: PromptRule[];
}): AssembledPrompt {
  const rules = [...DEFAULT_RULES, ...(input.extraRules ?? [])];
  const userRaw = input.prompt.trim();
  const injection = detectInjectionSignals(userRaw);
  const userBody =
    injection.length > 0
      ? wrapUntrustedReference("user-input-flagged", userRaw)
      : wrapUntrustedReference("user-input", userRaw);

  const layers: PromptLayerSnapshot[] = rules.map((rule) => ({
    kind: rule.kind,
    content: rule.content
  }));
  layers.push(
    { kind: "session", content: `Session: ${input.sessionTitle}` },
    { kind: "workflow-phase", content: `Workflow phase: ${input.scenario}` }
  );

  const finalText = [
    ...layers.map((layer) => `[${layer.kind}] ${layer.content}`),
    userBody
  ].join("\n\n");

  const contentHash = createHash("sha256").update(finalText).digest("hex").slice(0, 16);
  const versionId = `${input.scenario}:${contentHash}`;

  return {
    versionId,
    scene: input.scenario,
    layers,
    finalText,
    contentHash
  };
}

export function diffPromptText(previous: string, next: string): string {
  const prevLines = previous.split(/\r?\n/);
  const nextLines = next.split(/\r?\n/);
  const max = Math.max(prevLines.length, nextLines.length);
  const out: string[] = [];
  for (let i = 0; i < max; i += 1) {
    const p = prevLines[i];
    const n = nextLines[i];
    if (p === n) {
      out.push(` ${p ?? ""}`);
    } else {
      if (p !== undefined) {
        out.push(`-${p}`);
      }
      if (n !== undefined) {
        out.push(`+${n}`);
      }
    }
  }
  return out.join("\n");
}

const versionHistory = new Map<string, string[]>();

export function rememberPromptVersion(workspaceKey: string, versionId: string, finalText: string): void {
  versionBodies.set(`${workspaceKey}:${versionId}`, finalText);
  const list = versionHistory.get(workspaceKey) ?? [];
  const next = [...list.filter((entry) => entry !== versionId), versionId];
  versionHistory.set(workspaceKey, next.slice(-20));
}

const versionBodies = new Map<string, string>();

export function rollbackPromptTo(workspaceKey: string, versionId: string): string | undefined {
  return versionBodies.get(`${workspaceKey}:${versionId}`);
}

export function listPromptVersions(workspaceKey: string): string[] {
  return versionHistory.get(workspaceKey) ?? [];
}
