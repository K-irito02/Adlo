import { describe, expect, it } from "vitest";
import type { ContextEntry } from "@ai-digital-life/kernel";
import { selectContextWindow, summarizeToolOutput } from "@ai-digital-life/context-engine";

describe("context engine", () => {
  it("prefers higher-priority entries when token budget is tight", () => {
    const entries: ContextEntry[] = [
      { id: "m", type: "message", label: "history", content: "x".repeat(400), tokenEstimate: 800 },
      { id: "f", type: "file", label: "src/a.ts", path: "src/a.ts", content: "small", tokenEstimate: 200 },
      { id: "t", type: "message", label: "terminal:last", content: "npm test failed", tokenEstimate: 300 }
    ];
    const picked = selectContextWindow(entries, 900, 0.1);
    const ids = picked.map((entry) => entry.id);
    expect(ids).toContain("f");
    expect(ids).toContain("t");
    expect(ids).not.toContain("m");
  });

  it("summarizes long tool output with head and tail", () => {
    const text = `${"ok line\n".repeat(30)}ERROR: boom\n${"tail line\n".repeat(10)}`;
    const summary = summarizeToolOutput(text, 20, 2000);
    expect(summary).toContain("ERROR: boom");
  });
});
