import { describe, expect, it, vi, beforeEach } from "vitest";
import { computePosition, Placement, Alignment } from "./tooltipPosition";

function createMockDOMRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 100,
    y: 100,
    width: 100,
    height: 50,
    top: 100,
    right: 200,
    bottom: 150,
    left: 100,
    ...overrides,
  } as DOMRect;
}

describe("tooltipPosition", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      innerWidth: 1920,
      innerHeight: 1080,
    });
  });

  describe("computePosition", () => {
    it("positions tooltip above trigger for top placement", () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "top",
        offset: 8,
      });

      expect(result.placement).toBe("top");
      expect(result.x).toBe(100 + 50 - 40);
      expect(result.y).toBe(200 - 30 - 8);
    });

    it("positions tooltip below trigger for bottom placement", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "bottom",
        offset: 8,
      });

      expect(result.placement).toBe("bottom");
      expect(result.y).toBe(150 + 8);
    });

    it("positions tooltip left of trigger for left placement", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 200, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "left",
        offset: 8,
      });

      expect(result.placement).toBe("left");
      expect(result.x).toBe(200 - 80 - 8);
    });

    it("positions tooltip right of trigger for right placement", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "right",
        offset: 8,
      });

      expect(result.placement).toBe("right");
      expect(result.x).toBe(200 + 8);
    });

    it("respects custom offset", () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "top",
        offset: 20,
      });

      expect(result.y).toBe(200 - 30 - 20);
    });

    it("respects alignment start", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "bottom",
        alignment: "start" as Alignment,
      });

      expect(result.x).toBe(100);
    });

    it("respects alignment end", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "bottom",
        alignment: "end" as Alignment,
      });

      expect(result.x).toBe(120);
    });

    it("calculates arrow position for top placement", () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "top",
      });

      expect(result.arrowX).toBeDefined();
    });

    it("calculates arrow position for bottom placement", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "bottom",
      });

      expect(result.arrowX).toBeDefined();
    });

    it("calculates arrow position for left placement", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 200, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "left",
      });

      expect(result.arrowY).toBeDefined();
    });

    it("calculates arrow position for right placement", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "right",
      });

      expect(result.arrowY).toBeDefined();
    });

    it("flips placement when not fitting in viewport", () => {
      const triggerRect = createMockDOMRect({ top: 10, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "top",
        offset: 8,
      });

      expect(result.placement).toBe("bottom");
    });

    it("clamps position to viewport bounds", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: -500, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "bottom",
        viewportPadding: 8,
      });

      expect(result.x).toBeGreaterThanOrEqual(8);
    });

    it("handles centered alignment by default", () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: "bottom",
      });

      expect(result.x).toBe(100 + 50 - 40);
    });
  });
});
