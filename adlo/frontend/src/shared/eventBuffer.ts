export class EventBuffer<T> {
  private events: T[] = [];
  private flushScheduled = false;

  push(event: T): void {
    this.events.push(event);
  }

  flush(): T[] {
    const batch = this.events;
    this.events = [];
    this.flushScheduled = false;
    return batch;
  }

  drainWithReconciliation(mergeKey: (event: T) => string, reducer: (prev: T, next: T) => T): T[] {
    const batch = this.flush();
    const seen = new Map<string, T>();
    for (const event of batch) {
      const key = mergeKey(event);
      const existing = seen.get(key);
      if (existing !== undefined) {
        seen.set(key, reducer(existing, event));
      } else {
        seen.set(key, event);
      }
    }
    return Array.from(seen.values());
  }

  scheduleFlush(callback: (events: T[]) => void): void {
    if (this.flushScheduled) {
      return;
    }
    this.flushScheduled = true;
    queueMicrotask(() => {
      const batch = this.flush();
      if (batch.length > 0) {
        callback(batch);
      }
    });
  }

  get length(): number {
    return this.events.length;
  }
}
