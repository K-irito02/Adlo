import { describe, expect, it } from "vitest";
import { renderMarkdownPreviewHtml } from "./markdownPreviewUtils";

describe("MarkdownPreview", () => {
  it("adds source-line anchors to rendered headings", () => {
    const html = renderMarkdownPreviewHtml("# 标题\n\n## 重复\n\n## 重复", "light");

    expect(html).toContain('<h1 data-source-line="1" id="adl-heading-1">标题</h1>');
    expect(html).toContain('<h2 data-source-line="3" id="adl-heading-3">重复</h2>');
    expect(html).toContain('<h2 data-source-line="5" id="adl-heading-5">重复</h2>');
  });
});
