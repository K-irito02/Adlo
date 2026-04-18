import { describe, expect, it } from "vitest";

import {
  renderBanner,
  renderButton,
  renderCard,
  renderEmptyState,
  renderNavItem,
  renderPill,
  renderSegmentedControl,
  renderStatTile
} from "../../../apps/desktop/renderer/src/design-system/components";
import { renderHtml } from "../../../apps/desktop/renderer/src/design-system/html";

describe("design-system/components", () => {
  describe("renderButton", () => {
    it("renders a primary button with label and icon", () => {
      const html = renderHtml(renderButton({ label: "Open", icon: "play" }));
      expect(html).toContain("class=\"btn");
      expect(html).toContain("type=\"button\"");
      expect(html).toContain("<svg");
      expect(html).toContain("Open");
    });

    it("supports loading + disabled states with proper aria attributes", () => {
      const html = renderHtml(
        renderButton({
          label: "Submit",
          loading: true,
          disabled: true
        })
      );
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain(" disabled");
    });

    it("forwards data attributes safely", () => {
      const html = renderHtml(
        renderButton({
          label: "Decide",
          data: { "approval-decision": "approved", "approval-id": "abc-123" }
        })
      );
      expect(html).toContain('data-approval-decision="approved"');
      expect(html).toContain('data-approval-id="abc-123"');
    });

    it("escapes hostile data attributes", () => {
      const html = renderHtml(
        renderButton({
          label: "x",
          data: { evil: '"><script>alert(1)</script>' }
        })
      );
      expect(html).not.toContain("<script>");
      expect(html).toContain("&quot;&gt;&lt;script&gt;");
    });

    it("supports icon-only mode without rendering label markup", () => {
      const html = renderHtml(
        renderButton({ label: "", icon: "close", iconOnly: true, ariaLabel: "Close" })
      );
      expect(html).toContain("btn--icon");
      expect(html).toContain('aria-label="Close"');
      expect(html).not.toContain("btn__label");
    });
  });

  describe("renderPill", () => {
    it("uses tone-specific class", () => {
      expect(renderHtml(renderPill({ label: "ok", tone: "healthy" }))).toContain("pill--healthy");
      expect(renderHtml(renderPill({ label: "x", tone: "danger" }))).toContain("pill--danger");
    });

    it("escapes label content", () => {
      const html = renderHtml(renderPill({ label: "<bad>" }));
      expect(html).toContain("&lt;bad&gt;");
      expect(html).not.toContain("<bad>");
    });
  });

  describe("renderSegmentedControl", () => {
    it("renders one button per option and marks the active one", () => {
      const html = renderHtml(
        renderSegmentedControl({
          name: "language",
          ariaLabel: "Language",
          value: "zh-CN",
          options: [
            { value: "zh-CN", label: "中文" },
            { value: "en-US", label: "English" }
          ]
        })
      );

      expect(html).toContain('aria-label="Language"');
      expect(html).toMatch(/data-segmented-name="language"[^>]*data-segmented-value="zh-CN"[^>]*aria-pressed="true"/);
      expect(html).toMatch(/data-segmented-value="en-US"[^>]*aria-pressed="false"/);
    });
  });

  describe("renderCard", () => {
    it("includes title + subtitle in header", () => {
      const html = renderHtml(
        renderCard({ title: "Status", subtitle: "Phase 0", children: "body" })
      );
      expect(html).toContain("card__header");
      expect(html).toContain("Status");
      expect(html).toContain("Phase 0");
      expect(html).toContain("body");
    });

    it("supports variant=inset and id", () => {
      const html = renderHtml(
        renderCard({ children: "x", variant: "inset", id: "sample-card" })
      );
      expect(html).toContain("card--inset");
      expect(html).toContain('id="sample-card"');
    });
  });

  describe("renderBanner", () => {
    it("renders empty banner without text but reserves space", () => {
      const html = renderHtml(renderBanner({ text: "", empty: true }));
      expect(html).toContain("banner--empty");
      expect(html).toContain('role="status"');
    });

    it("renders danger banner with assertive live region", () => {
      const html = renderHtml(
        renderBanner({ text: "Boom", tone: "danger", live: "assertive" })
      );
      expect(html).toContain("banner--error");
      expect(html).toContain('aria-live="assertive"');
    });
  });

  describe("renderEmptyState", () => {
    it("renders icon, title and optional description", () => {
      const html = renderHtml(
        renderEmptyState({ icon: "folder", title: "Nothing here", description: "Try something" })
      );
      expect(html).toContain("empty-state");
      expect(html).toContain("Nothing here");
      expect(html).toContain("Try something");
      expect(html).toContain("<svg");
    });
  });

  describe("renderNavItem", () => {
    it("emits aria-current=page when current is true", () => {
      const html = renderHtml(renderNavItem({ icon: "home", label: "Home", current: true }));
      expect(html).toContain('aria-current="page"');
    });
  });

  describe("renderStatTile", () => {
    it("renders label / value / detail", () => {
      const html = renderHtml(
        renderStatTile({ label: "Scanned", value: "42", detail: "files" })
      );
      expect(html).toContain("Scanned");
      expect(html).toContain("42");
      expect(html).toContain("files");
    });
  });
});
