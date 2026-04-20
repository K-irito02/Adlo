// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipSimple } from "../../../apps/desktop/renderer/src/app/components/Tooltip";
import { computePosition } from "../../../apps/desktop/renderer/src/app/utils/tooltipPosition";

class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

describe("tooltipPosition", () => {
  function makeRect(x: number, y: number, w: number, h: number): DOMRect {
    return DOMRect.fromRect({ x, y, width: w, height: h });
  }

  describe("computePosition - basic placements", () => {
    it("places tooltip above the trigger for 'top' placement", () => {
      const trigger = makeRect(100, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 120, height: 32 },
        placement: "top"
      });
      expect(result.placement).toBe("top");
      expect(result.y).toBeLessThan(trigger.top);
      expect(result.x).toBeCloseTo(100 + 40 / 2 - 120 / 2, 0);
      expect(result.arrowX).toBeDefined();
    });

    it("places tooltip below the trigger for 'bottom' placement", () => {
      const trigger = makeRect(100, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 120, height: 32 },
        placement: "bottom"
      });
      expect(result.placement).toBe("bottom");
      expect(result.y).toBeGreaterThan(trigger.bottom);
    });

    it("places tooltip to the left of the trigger for 'left' placement", () => {
      const trigger = makeRect(300, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 100, height: 28 },
        placement: "left"
      });
      expect(result.placement).toBe("left");
      expect(result.x).toBeLessThan(trigger.left);
      expect(result.arrowY).toBeDefined();
    });

    it("places tooltip to the right of the trigger for 'right' placement", () => {
      const trigger = makeRect(100, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 100, height: 28 },
        placement: "right"
      });
      expect(result.placement).toBe("right");
      expect(result.x).toBeGreaterThan(trigger.right);
    });
  });

  describe("computePosition - alignment", () => {
    it("aligns to start (top-left corner) when alignment is 'start'", () => {
      const trigger = makeRect(200, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 120, height: 32 },
        placement: "top",
        alignment: "start"
      });
      expect(result.placement).toBe("top");
      expect(result.x).toBeCloseTo(trigger.left, 0);
    });

    it("aligns to end (top-right corner) when alignment is 'end'", () => {
      const trigger = makeRect(200, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 120, height: 32 },
        placement: "top",
        alignment: "end"
      });
      expect(result.placement).toBe("top");
      expect(result.x + 120).toBeCloseTo(trigger.right, 0);
    });

    it("centers by default", () => {
      const trigger = makeRect(200, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 120, height: 32 },
        placement: "top",
        alignment: "center"
      });
      const centerX = result.x + 120 / 2;
      expect(centerX).toBeCloseTo(trigger.left + 40 / 2, 0);
    });
  });

  describe("computePosition - flip behavior", () => {
    it("flips to bottom when top would overflow viewport top", () => {
      const trigger = makeRect(100, 5, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 120, height: 50 },
        placement: "top",
        offset: 8
      });
      expect(result.placement).toBe("bottom");
    });

    it("flips to left when right would overflow viewport right", () => {
      Object.defineProperty(window, "innerWidth", { value: 800, writable: true });
      const trigger = makeRect(750, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 100, height: 28 },
        placement: "right",
        offset: 8
      });
      expect(result.placement).not.toBe("right");
    });
  });

  describe("computePosition - boundary clamping", () => {
    it("clamps tooltip x position within viewport bounds", () => {
      const trigger = makeRect(-10, 200, 20, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 120, height: 32 },
        placement: "top"
      });
      expect(result.x).toBeGreaterThanOrEqual(8);
    });

    it("clamps tooltip when it extends beyond right edge", () => {
      Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
      const trigger = makeRect(980, 200, 40, 30);
      const result = computePosition({
        triggerRect: trigger,
        tooltipRect: { width: 120, height: 32 },
        placement: "bottom"
      });
      expect(result.x + 120).toBeLessThanOrEqual(1016);
    });
  });
});

describe("Tooltip component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  describe("basic rendering", () => {
    it("renders nothing when closed and not mounted", () => {
      render(
        <Tooltip showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Hover me</button>
          </TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      );
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    });

    it("renders tooltip content with role='tooltip'", async () => {
      render(
        <Tooltip showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Hover me</button>
          </TooltipTrigger>
          <TooltipContent data-testid="my-tooltip">Hello Tooltip</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Hover me");
      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });

      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
      expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Hello Tooltip");
    });

    it("renders multi-line text correctly", async () => {
      render(
        <Tooltip showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Info</button>
          </TooltipTrigger>
          <TooltipContent>{"Line one\nLine two\nLine three"}</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Info");
      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });

      const tooltip = screen.getByRole("tooltip", { hidden: true });
      expect(tooltip).toHaveTextContent("Line one");
      expect(tooltip).toHaveTextContent("Line two");
      expect(tooltip).toHaveTextContent("Line three");
    });

    it("renders rich HTML content", async () => {
      render(
        <Tooltip showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Details</button>
          </TooltipTrigger>
          <TooltipContent>
            <strong>Bold text</strong> and <em>italic</em>
          </TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Details");
      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });

      const tooltip = screen.getByRole("tooltip", { hidden: true });
      expect(tooltip.querySelector("strong")).toBeInTheDocument();
      expect(tooltip.querySelector("em")).toBeInTheDocument();
    });
  });

  describe("interaction behavior", () => {
    it("shows on hover after show delay", async () => {
      render(
        <Tooltip showDelay={300} hideDelay={0}>
          <TooltipTrigger>
            <button>Hover me</button>
          </TooltipTrigger>
          <TooltipContent>Delayed tip</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Hover me");

      act(() => {
        fireEvent.mouseEnter(trigger);
      });

      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(299);
      });
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
    });

    it("hides on mouse leave after hide delay", async () => {
      render(
        <Tooltip showDelay={0} hideDelay={150}>
          <TooltipTrigger>
            <button>Hover me</button>
          </TooltipTrigger>
          <TooltipContent>Hide me</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Hover me");

      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

      act(() => {
        fireEvent.mouseLeave(trigger);
      });

      await act(async () => {
        vi.advanceTimersByTime(149);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(251);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toHaveAttribute("data-state", "closed");
    });

    it("stays visible when moving from trigger to tooltip (mouse bridge)", async () => {
      render(
        <Tooltip showDelay={0} hideDelay={150}>
          <TooltipTrigger>
            <button>Bridge test</button>
          </TooltipTrigger>
          <TooltipContent>Bridged content</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Bridge test");

      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

      act(() => {
        fireEvent.mouseLeave(trigger);
        vi.advanceTimersByTime(50);
      });

      const tooltip = screen.getByRole("tooltip", { hidden: true });
      act(() => {
        fireEvent.mouseEnter(tooltip);
      });

      await act(async () => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
    });

    it("closes on Escape key press", async () => {
      render(
        <Tooltip showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Escape me</button>
          </TooltipTrigger>
          <TooltipContent>Press Escape</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Escape me");
      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

      act(() => {
        fireEvent.keyDown(document, { key: "Escape" });
      });

      expect(screen.getByRole("tooltip", { hidden: true })).toHaveAttribute("data-state", "closed");
    });

    it("shows on focus and hides on blur", async () => {
      render(
        <Tooltip trigger="focus" showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Focus me</button>
          </TooltipTrigger>
          <TooltipContent>Focus tip</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Focus me");

      await act(async () => {
        fireEvent.focus(trigger);
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

      act(() => {
        fireEvent.blur(trigger);
      });

      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    });

    it("toggles open/close on click in click mode", async () => {
      render(
        <Tooltip trigger="click" showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Click me</button>
          </TooltipTrigger>
          <TooltipContent>Click tip</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Click me");

      act(() => {
        fireEvent.click(trigger);
      });
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

      act(() => {
        fireEvent.click(trigger);
      });

      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    });

    it("dismissible mode shows close button and closes on click", async () => {
      render(
        <Tooltip dismissible showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Dismissible</button>
          </TooltipTrigger>
          <TooltipContent>Long content with close</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Dismissible");
      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });

      const tooltip = screen.getByRole("tooltip", { hidden: true });
      const closeButton = tooltip.querySelector(".tooltip__close");
      expect(closeButton).toBeInTheDocument();

      act(() => {
        if (closeButton) fireEvent.click(closeButton);
      });

      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    });
  });

  describe("positioning", () => {
    it("applies correct data-side attribute based on placement", async () => {
      render(
        <Tooltip defaultPlacement="bottom" showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>Bottom tip</button>
          </TooltipTrigger>
          <TooltipContent>Below</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Bottom tip");
      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });

      const tooltip = screen.getByRole("tooltip", { hidden: true });
      expect(tooltip).toHaveAttribute("data-side", "bottom");
    });

    it("applies data-state attribute correctly", async () => {
      render(
        <Tooltip showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>State test</button>
          </TooltipTrigger>
          <TooltipContent>Check state</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("State test");
      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });

      const tooltip = screen.getByRole("tooltip", { hidden: true });
      expect(tooltip).toHaveAttribute("data-state", "open");
    });
  });

  describe("accessibility", () => {
    it("has role='tooltip' on the content element", async () => {
      render(
        <Tooltip showDelay={0} hideDelay={0}>
          <TooltipTrigger>
            <button>A11y test</button>
          </TooltipTrigger>
          <TooltipContent>Accessible tip</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("A11y test");
      await act(async () => {
        fireEvent.mouseEnter(trigger);
        vi.advanceTimersByTime(1);
      });

      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
    });
  });

  describe("controlled mode", () => {
    it("respects controlled open state", async () => {
      const { rerender } = render(
        <Tooltip open={false} showDelay={0} hideDelay={0} onOpenChange={() => {}}>
          <TooltipTrigger>
            <button>Controlled</button>
          </TooltipTrigger>
          <TooltipContent>Controlled tip</TooltipContent>
        </Tooltip>
      );
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();

      rerender(
        <Tooltip open={true} showDelay={0} hideDelay={0} onOpenChange={() => {}}>
          <TooltipTrigger>
            <button>Controlled</button>
          </TooltipTrigger>
          <TooltipContent>Controlled tip</TooltipContent>
        </Tooltip>
      );
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("cleans up timers on unmount", async () => {
      const { unmount } = render(
        <Tooltip showDelay={500} hideDelay={0}>
          <TooltipTrigger>
            <button>Unmount</button>
          </TooltipTrigger>
          <TooltipContent>Will unmount</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Unmount");

      act(() => {
        fireEvent.mouseEnter(trigger);
      });

      act(() => {
        unmount();
        vi.advanceTimersByTime(600);
      });

      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    });

    it("handles rapid enter/leave without errors", async () => {
      render(
        <Tooltip showDelay={100} hideDelay={100}>
          <TooltipTrigger>
            <button>Rapid</button>
          </TooltipTrigger>
          <TooltipContent>Rapid tip</TooltipContent>
        </Tooltip>
      );

      const trigger = screen.getByText("Rapid");

      for (let i = 0; i < 10; i++) {
        act(() => {
          fireEvent.mouseEnter(trigger);
          vi.advanceTimersByTime(50);
          fireEvent.mouseLeave(trigger);
          vi.advanceTimersByTime(50);
        });
      }
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    });
  });
});

describe("TooltipSimple convenience component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("renders with simple API", async () => {
    render(<TooltipSimple content="Simple tip"><span>Simple</span></TooltipSimple>);
    const trigger = screen.getByText("Simple");

    await act(async () => {
      fireEvent.mouseEnter(trigger);
      vi.advanceTimersByTime(301);
    });

    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Simple tip");
  });
});
