import { describe, expect, it } from "vitest";

import { listIcons, renderIcon } from "../../../apps/desktop/renderer/src/design-system/icons";
import { renderHtml } from "../../../apps/desktop/renderer/src/design-system/html";

describe("design-system/icons", () => {
  it("registers a non-empty icon catalogue", () => {
    expect(listIcons().length).toBeGreaterThan(15);
    expect(listIcons()).toContain("home");
    expect(listIcons()).toContain("settings");
  });

  it("renders an SVG that uses currentColor", () => {
    const svg = renderHtml(renderIcon("home"));
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
  });

  it("marks decorative icons aria-hidden", () => {
    const svg = renderHtml(renderIcon("settings", { decorative: true }));
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain("aria-label");
  });

  it("exposes role=img and aria-label when title is provided", () => {
    const svg = renderHtml(renderIcon("alert-triangle", { title: "Warning" }));
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Warning"');
  });

  it("escapes quotes in titles to prevent attribute injection", () => {
    const svg = renderHtml(renderIcon("info", { title: 'Note "quoted"' }));
    expect(svg).toContain('aria-label="Note &quot;quoted&quot;"');
  });

  it("returns an empty string for unknown icons", () => {
    // @ts-expect-error - intentionally pass invalid name
    expect(renderHtml(renderIcon("not-real"))).toBe("");
  });

  it("applies size class modifiers", () => {
    expect(renderHtml(renderIcon("close", { size: "xs" }))).toContain("icon--xs");
    expect(renderHtml(renderIcon("close", { size: "lg" }))).toContain("icon--lg");
  });
});
