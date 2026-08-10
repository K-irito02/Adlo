/**
 * Injectable EventSource wrapper for the ad-server `/event` SSE stream.
 *
 * Native `EventSource` reconnects automatically and resends `Last-Event-ID`
 * from the server's `id:` lines, so a dropped connection resumes from the last
 * record without extra bookkeeping. The initial `?after=` query supports
 * start-from-replay (used when the caller knows a resume point up front).
 */

export type EventSourceFactory = (url: string, options?: EventSourceInit) => EventSource;

export interface SseSubscriptionOptions {
  baseUrl: string;
  /** Injectable EventSource constructor — tests pass a fake. */
  eventSourceFactory?: EventSourceFactory;
  /** Initial `?after=` resume point (event_log seq). */
  lastEventId?: number;
  /**
   * Called with each SSE record's `data:` payload and the record `id:` (when
   * the server sent one). `data` is the raw JSON string of a
   * `SessionPartEvent`; decoding + mapping is the caller's job.
   */
  onEvent: (data: string, recordId?: string) => void;
}

/** Build the `/event` URL, honoring a leading `?after=` resume point. */
export function eventSourceUrl(baseUrl: string, lastEventId?: number): string {
  const base = baseUrl.replace(/\/+$/, '');
  return lastEventId !== undefined ? `${base}/event?after=${lastEventId}` : `${base}/event`;
}

/**
 * Open an EventSource against `${baseUrl}/event` and wire `onmessage` to
 * `onEvent`. Returns a synchronous `() => void` unsubscribe that closes the
 * connection (native EventSource auto-reconnects until closed).
 */
export function subscribeEventSource(opts: SseSubscriptionOptions): () => void {
  const factory: EventSourceFactory =
    opts.eventSourceFactory ?? ((url, options) => new EventSource(url, options));
  const es = factory(eventSourceUrl(opts.baseUrl, opts.lastEventId));
  es.onmessage = (ev) => {
    const recordId = (ev as { lastEventId?: string }).lastEventId;
    opts.onEvent(String(ev.data ?? ''), recordId);
  };
  return () => es.close();
}
