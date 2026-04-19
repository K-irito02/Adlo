import type { ContextEntry } from "@ai-digital-life/kernel";

export function selectContextWindow(entries: ContextEntry[], maxTokens = 3000): ContextEntry[] {
  const sorted = entries.slice().sort((left, right) => left.tokenEstimate - right.tokenEstimate);
  const picked: ContextEntry[] = [];
  let usedTokens = 0;

  for (const entry of sorted) {
    if (usedTokens + entry.tokenEstimate > maxTokens) {
      continue;
    }
    picked.push(entry);
    usedTokens += entry.tokenEstimate;
  }

  return picked;
}

export function summarizeContext(entries: ContextEntry[]): string {
  if (entries.length === 0) {
    return "No extra context attached.";
  }

  return entries
    .map((entry) => `- ${entry.label}${entry.path ? ` (${entry.path})` : ""}`)
    .join("\n");
}
