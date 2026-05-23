import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildStickyContextEntries,
  createStickyContextModel
} from "./stickyContext";

describe("stickyContext helpers", () => {
  it("always exposes a file-top entry and falls back to line text when no outline exists", () => {
    const entries = buildStickyContextEntries({
      content: ["alpha", "", "beta", "gamma", "delta"].join("\n"),
      outline: [],
      visibleStartLine: 5,
      maxContextRows: 3
    });

    expect(entries.map((entry) => entry.line)).toEqual([1, 3, 4]);
    expect(entries.map((entry) => entry.label)).toEqual(["alpha", "beta", "gamma"]);
    expect(entries.every((entry) => entry.kind === "line")).toBe(true);
  });

  it("prefers the most recent structural outline context for markdown and code files", () => {
    const entries = buildStickyContextEntries({
      content: [
        "# Overview",
        "intro",
        "## Details",
        "more",
        "function buildModel() {}",
        "tail"
      ].join("\n"),
      outline: [
        { id: "h1", label: "Overview", kind: "heading", line: 1 },
        { id: "h2", label: "Details", kind: "heading", line: 3 },
        { id: "fn", label: "buildModel", kind: "function", line: 5 }
      ],
      visibleStartLine: 6,
      maxContextRows: 3
    });

    expect(entries.map((entry) => ({ kind: entry.kind, label: entry.label, line: entry.line }))).toEqual([
      { kind: "heading", label: "Overview", line: 1 },
      { kind: "heading", label: "Details", line: 3 },
      { kind: "function", label: "buildModel", line: 5 }
    ]);
  });

  it("marks diff-backed entries with change-aware tones from modified/current ranges", () => {
    const entries = buildStickyContextEntries({
      content: ["one", "two", "three", "four"].join("\n"),
      outline: [],
      visibleStartLine: 4,
      maxContextRows: 3,
      diffRanges: [
        { startLine: 2, endLine: 2, type: "insert", tone: "strong", contentColumns: 3 },
        { startLine: 3, endLine: 3, type: "delete", tone: "base", contentColumns: 3 }
      ]
    });

    expect(entries.map((entry) => entry.tone)).toEqual(["context", "insert", "delete"]);
  });

  it("creates a model whose navigation delegates to the provided line callback", () => {
    const visited: number[] = [];

    const model = createStickyContextModel({
      canScrollToTop: true,
      onNavigateLine: (line) => visited.push(line)
    });

    model.scrollToTop();

    expect(model.topEntry.kind).toBe("top");
    expect(model.showTopEntry).toBe(true);
    expect(visited).toEqual([1]);
  });

  it("hides the top row when the first real file line is already visible", () => {
    const model = createStickyContextModel({
      canScrollToTop: false,
      onNavigateLine: () => undefined
    });

    expect(model.showTopEntry).toBe(false);
  });
});

describe("sticky context panel wiring", () => {
  const editorSurfaceShellSource = readFileSync(new URL("./EditorSurfaceShell.tsx", import.meta.url), "utf8");
  const useStickyContextSource = readFileSync(new URL("./hooks/useStickyContext.ts", import.meta.url), "utf8");
  const changesPanelSource = readFileSync(new URL("./panels/ChangesPanel.tsx", import.meta.url), "utf8");

  it("renders sticky context above the files editor surface in both editor modes", () => {
    expect(editorSurfaceShellSource).toContain("StickyContext");
    expect(editorSurfaceShellSource).toContain('data-testid="files-sticky-context"');
    expect(useStickyContextSource).toContain("buildStickyContextEntries");
    expect(useStickyContextSource).toContain("createStickyContextModel");
  });

  it("renders sticky context above the changes preview surface", () => {
    expect(changesPanelSource).toContain("StickyContext");
    expect(changesPanelSource).toContain('data-testid="changes-sticky-context"');
    expect(useStickyContextSource).toContain("buildStickyContextEntries");
    expect(useStickyContextSource).toContain("createStickyContextModel");
  });
});
