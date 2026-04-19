import type { ContextEntry } from "@ai-digital-life/kernel";

const DEFAULT_OUTPUT_RESERVE_RATIO = 0.15;

function entryRank(entry: ContextEntry): number {
  if (entry.label.startsWith("terminal")) {
    return 18;
  }
  switch (entry.type) {
    case "file":
      return entry.content.trim().length > 0 ? 10 : 25;
    case "diagnostic":
      return 15;
    case "outline":
      return 20;
    case "search-hit":
      return 30;
    case "message":
      return 40;
    default:
      return 50;
  }
}

/**
 * Packs context entries by priority rank (lower is more important), then by smaller tokenEstimate
 * within the same rank to fit more references under a fixed budget. Reserves a slice of the
 * budget for model output.
 */
export function selectContextWindow(
  entries: ContextEntry[],
  maxTokens = 3000,
  outputReserveRatio = DEFAULT_OUTPUT_RESERVE_RATIO
): ContextEntry[] {
  const reserve = Math.min(0.35, Math.max(0.05, outputReserveRatio));
  const effectiveMax = Math.max(256, Math.floor(maxTokens * (1 - reserve)));
  const sorted = entries.slice().sort((left, right) => {
    const rankDiff = entryRank(left) - entryRank(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.tokenEstimate - right.tokenEstimate;
  });
  const picked: ContextEntry[] = [];
  let usedTokens = 0;

  for (const entry of sorted) {
    if (usedTokens + entry.tokenEstimate > effectiveMax) {
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
    .map((entry) => {
      const preview = entry.content.trim().split(/\r?\n/).slice(0, 3).join(" ").slice(0, 220);
      const tail = entry.content.length > 220 ? "…" : "";
      return `- ${entry.label}${entry.path ? ` (${entry.path})` : ""}${preview ? `: ${preview}${tail}` : ""}`;
    })
    .join("\n");
}

export function summarizeToolOutput(text: string, maxLines = 12, maxChars = 1800): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "(empty tool output)";
  }
  const lines = trimmed.split(/\r?\n/);
  const errorLineIndex = lines.findIndex((line) => /error|failed|exception|fatal/i.test(line));
  const head = lines.slice(0, Math.min(4, lines.length)).join("\n");
  const tail = lines.slice(-Math.min(8, lines.length)).join("\n");
  let body = errorLineIndex >= 0 ? `${head}\n…\n${lines[errorLineIndex]}\n…\n${tail}` : `${head}\n…\n${tail}`;
  body = body.slice(0, maxChars);
  const lineBudget = lines.slice(0, maxLines).join("\n");
  return body.length < lineBudget.length ? body : lineBudget;
}

export function summarizeConversationHistory(
  turns: Array<{ role: string; content: string }>,
  maxRecent = 4,
  maxChars = 1200
): string {
  if (turns.length === 0) {
    return "";
  }
  const recent = turns.slice(-maxRecent);
  const lines = recent.map((turn) => `${turn.role}: ${turn.content.trim().replace(/\s+/g, " ").slice(0, 200)}`);
  return lines.join("\n").slice(0, maxChars);
}

type L1Key = string;

const l1SessionSummaries = new Map<L1Key, { text: string; updatedAt: number }>();

export function makeContextCacheKey(workspaceId: string, sessionId: string, artifactHash: string): string {
  return `${workspaceId}:${sessionId}:${artifactHash}`;
}

export function rememberSessionSummary(workspaceId: string, sessionId: string, artifactHash: string, text: string): void {
  l1SessionSummaries.set(makeContextCacheKey(workspaceId, sessionId, artifactHash), { text, updatedAt: Date.now() });
}

export function readSessionSummary(workspaceId: string, sessionId: string, artifactHash: string): string | undefined {
  return l1SessionSummaries.get(makeContextCacheKey(workspaceId, sessionId, artifactHash))?.text;
}

export function invalidateSessionSummaryL1(workspaceId: string): void {
  for (const key of l1SessionSummaries.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      l1SessionSummaries.delete(key);
    }
  }
}
