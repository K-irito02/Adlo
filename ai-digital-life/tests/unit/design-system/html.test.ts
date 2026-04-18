import { describe, expect, it } from "vitest";

import {
  classNames,
  escapeHtml,
  formatBytes,
  html,
  isRaw,
  raw,
  renderHtml
} from "../../../apps/desktop/renderer/src/design-system/html";

describe("design-system/html", () => {
  describe("escapeHtml", () => {
    it("escapes html-significant characters", () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
      );
    });

    it("escapes single quotes and ampersands", () => {
      expect(escapeHtml("Tom & Jerry's")).toBe("Tom &amp; Jerry&#39;s");
    });

    it("returns empty string for null / undefined / false", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
      expect(escapeHtml(false)).toBe("");
    });

    it("coerces numbers", () => {
      expect(escapeHtml(42)).toBe("42");
    });
  });

  describe("html tagged template", () => {
    it("escapes interpolated strings", () => {
      const value = "<script>";
      const result = html`<p>${value}</p>`;
      expect(isRaw(result)).toBe(true);
      expect(renderHtml(result)).toBe("<p>&lt;script&gt;</p>");
    });

    it("preserves raw HTML when wrapped with raw()", () => {
      const trusted = raw("<strong>safe</strong>");
      expect(renderHtml(html`<div>${trusted}</div>`)).toBe("<div><strong>safe</strong></div>");
    });

    it("flattens arrays of values", () => {
      const items = ["a", "b", "c"];
      const result = renderHtml(html`<ul>${items.map((item) => html`<li>${item}</li>`)}</ul>`);
      expect(result).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>");
    });

    it("composes nested templates without double-escaping", () => {
      const inner = html`<em>${"<b>"}</em>`;
      expect(renderHtml(html`<p>${inner}</p>`)).toBe("<p><em>&lt;b&gt;</em></p>");
    });

    it("drops null / undefined / false interpolations", () => {
      const result = renderHtml(html`<p>${null}${undefined}${false}</p>`);
      expect(result).toBe("<p></p>");
    });
  });

  describe("classNames", () => {
    it("combines string truthy values", () => {
      expect(classNames("a", "b")).toBe("a b");
    });

    it("drops falsy values", () => {
      expect(classNames("a", false, undefined, null, "b")).toBe("a b");
    });

    it("handles object map", () => {
      expect(classNames("base", { active: true, disabled: false })).toBe("base active");
    });
  });

  describe("formatBytes", () => {
    it("returns 0 B for zero or negative", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(-1)).toBe("0 B");
    });

    it("formats kilobytes / megabytes / gigabytes", () => {
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    });

    it("respects fractionDigits", () => {
      expect(formatBytes(1536, 0)).toBe("2 KB");
      expect(formatBytes(1536, 2)).toBe("1.50 KB");
    });
  });
});
