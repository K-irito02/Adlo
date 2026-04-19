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

export function buildPrompt(input: {
  scenario: ConversationScenario;
  sessionTitle: string;
  prompt: string;
  extraRules?: PromptRule[];
}): string {
  const rules = [...DEFAULT_RULES, ...(input.extraRules ?? [])]
    .map((rule) => `[${rule.kind}] ${rule.content}`)
    .join("\n");

  return [
    rules,
    `[session] ${input.sessionTitle}`,
    `[workflow-phase] ${input.scenario}`,
    "[user]",
    input.prompt.trim()
  ].join("\n\n");
}
