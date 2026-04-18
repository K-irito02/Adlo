import { createId, type BaseEvent } from "@ai-digital-life/kernel";

export type EventHandler<TEvent extends BaseEvent = BaseEvent> = (event: TEvent) => void | Promise<void>;

export interface EventOptions {
  priority?: number;
  once?: boolean;
  signal?: AbortSignal;
}

interface Subscription {
  id: string;
  handler: EventHandler;
  priority: number;
  once: boolean;
}

export interface EventBus {
  on<TEvent extends BaseEvent>(eventType: TEvent["type"], handler: EventHandler<TEvent>, options?: EventOptions): string;
  once<TEvent extends BaseEvent>(eventType: TEvent["type"], handler: EventHandler<TEvent>, options?: Omit<EventOptions, "once">): string;
  off(subscriptionId: string): boolean;
  emit<TEvent extends BaseEvent>(event: TEvent): Promise<void>;
  clear(eventType?: string): void;
  listenerCount(eventType: string): number;
}

class InMemoryEventBus implements EventBus {
  private readonly subscriptions = new Map<string, Subscription[]>();

  on<TEvent extends BaseEvent>(eventType: TEvent["type"], handler: EventHandler<TEvent>, options: EventOptions = {}): string {
    const subscription: Subscription = {
      id: createId("evt"),
      handler: handler as EventHandler,
      priority: options.priority ?? 10,
      once: options.once ?? false
    };
    const nextSubscriptions = [...(this.subscriptions.get(eventType) ?? []), subscription].sort(
      (left, right) => right.priority - left.priority
    );
    this.subscriptions.set(eventType, nextSubscriptions);

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        this.off(subscription.id);
      });
    }

    return subscription.id;
  }

  once<TEvent extends BaseEvent>(eventType: TEvent["type"], handler: EventHandler<TEvent>, options: Omit<EventOptions, "once"> = {}): string {
    return this.on(eventType, handler, { ...options, once: true });
  }

  off(subscriptionId: string): boolean {
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      const nextSubscriptions = subscriptions.filter((subscription) => subscription.id !== subscriptionId);
      if (nextSubscriptions.length !== subscriptions.length) {
        if (nextSubscriptions.length === 0) {
          this.subscriptions.delete(eventType);
        } else {
          this.subscriptions.set(eventType, nextSubscriptions);
        }
        return true;
      }
    }

    return false;
  }

  async emit<TEvent extends BaseEvent>(event: TEvent): Promise<void> {
    const subscriptions = [...(this.subscriptions.get(event.type) ?? [])];
    for (const subscription of subscriptions) {
      await subscription.handler(event);
      if (subscription.once) {
        this.off(subscription.id);
      }
    }
  }

  clear(eventType?: string): void {
    if (eventType) {
      this.subscriptions.delete(eventType);
      return;
    }

    this.subscriptions.clear();
  }

  listenerCount(eventType: string): number {
    return this.subscriptions.get(eventType)?.length ?? 0;
  }
}

let globalBus: EventBus | undefined;

export function createEventBus(): EventBus {
  return new InMemoryEventBus();
}

export function getGlobalEventBus(): EventBus {
  globalBus ??= createEventBus();
  return globalBus;
}

export function resetGlobalEventBus(): void {
  globalBus = undefined;
}
