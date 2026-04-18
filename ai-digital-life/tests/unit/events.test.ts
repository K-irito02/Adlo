import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "@ai-digital-life/events";
import { EVENT_NAMES, type BaseEvent } from "@ai-digital-life/kernel";

describe("events", () => {
  it("dispatches handlers in priority order", async () => {
    const bus = createEventBus();
    const order: number[] = [];

    bus.on(EVENT_NAMES.workspaceOpened, () => order.push(1), { priority: 10 });
    bus.on(EVENT_NAMES.workspaceOpened, () => order.push(2), { priority: 100 });
    bus.on(EVENT_NAMES.workspaceOpened, () => order.push(3), { priority: 50 });

    await bus.emit({
      type: EVENT_NAMES.workspaceOpened,
      timestamp: Date.now(),
      payload: { workspaceId: "ws-1" }
    });

    expect(order).toEqual([2, 3, 1]);
  });

  it("supports once subscriptions", async () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.once(EVENT_NAMES.configChanged, handler);

    const event: BaseEvent<typeof EVENT_NAMES.configChanged, { key: string }> = {
      type: EVENT_NAMES.configChanged,
      timestamp: Date.now(),
      payload: { key: "language" }
    };

    await bus.emit(event);
    await bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
