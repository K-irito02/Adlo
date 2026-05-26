import { writeJson, writeNumber } from "./localStorageUtils";

export function createStorageScheduler() {
  const pendingWrites = new Map<string, unknown>();
  const pendingNumberWrites = new Map<string, number>();
  let writeScheduled = false;

  function scheduleFlush(): void {
    if (writeScheduled) return;
    writeScheduled = true;
    const flush = () => {
      writeScheduled = false;
      for (const [key, value] of pendingWrites) {
        writeJson(key, value);
      }
      pendingWrites.clear();
      for (const [key, value] of pendingNumberWrites) {
        writeNumber(key, value);
      }
      pendingNumberWrites.clear();
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(flush, { timeout: 500 });
    } else {
      setTimeout(flush, 50);
    }
  }

  function scheduleWrite(key: string, value: unknown): void {
    pendingWrites.set(key, value);
    scheduleFlush();
  }

  function scheduleNumberWrite(key: string, value: number): void {
    pendingNumberWrites.set(key, value);
    scheduleFlush();
  }

  return { scheduleWrite, scheduleNumberWrite };
}
