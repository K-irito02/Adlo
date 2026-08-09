/**
 * SSE (Server-Sent Events) wire parser for the ad-server `/event` stream.
 *
 * The server (`crates/server/src/sse_server.rs`) emits events as
 * `SessionPartEvent` JSON values, one per SSE record (`id:` / `data:` lines),
 * with `Last-Event-ID` reconnect support. Task 8 (SSE event bridge) will map
 * those records to the frontend `subscribe*` contracts
 * (`DigitalLifeModelStreamEventV1`, `DigitalLifeRunActivityEventV1`,
 * `DigitalLifeTerminalStreamEventV1`, `PtyOutputEvent`). This module provides
 * the reusable parsing primitives that task consumes.
 */

export interface SseRecord {
  /** The `event:` field, when present. */
  event?: string;
  /** The `id:` field, when present (used for Last-Event-ID reconnect). */
  id?: string;
  /** The `data:` field joined across consecutive data lines. */
  data: string;
}

/**
 * Split an SSE response chunk into its raw records. Per the SSE spec an event
 * is delimited by a blank line; `event:`, `id:` and consecutive `data:` lines
 * belong to the same record until the blank line is seen. Comment lines
 * (starting with `:`) and unknown fields are ignored.
 */
export function parseSseRecords(chunk: string): SseRecord[] {
  const records: SseRecord[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let dataLines: string[] = [];

  const flush = (): void => {
    if (dataLines.length > 0) {
      const record: SseRecord = { data: dataLines.join('\n') };
      if (event !== undefined) {
        record.event = event;
      }
      if (id !== undefined) {
        record.id = id;
      }
      records.push(record);
    }
    event = undefined;
    id = undefined;
    dataLines = [];
  };

  for (const rawLine of chunk.split(/\r?\n/)) {
    if (rawLine === '') {
      flush();
      continue;
    }
    if (rawLine.startsWith(':')) {
      // comment line — ignored
      continue;
    }
    const colon = rawLine.indexOf(':');
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    // The SSE spec strips a single leading space after the colon.
    const value = colon === -1 ? '' : rawLine.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') {
      event = value;
    } else if (field === 'id') {
      id = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
    // other fields (retry:, etc.) are ignored
  }
  // A trailing record without a terminating blank line is still valid.
  flush();
  return records;
}

/**
 * Decode a JSON `SessionPartEvent` wire payload (the `data:` field of an SSE
 * record) into a typed object when it carries the given `type` discriminator.
 * Returns `null` when the payload is not JSON, lacks a `type`, or the type
 * does not match. Task 8 uses this to route `message.part.updated`,
 * `session.status`, etc. to the matching frontend stream contract.
 */
export function decodeTypedSseEvent<T>(data: string, type: string): T | null {
  try {
    const parsed = JSON.parse(data) as { type?: unknown };
    if (parsed.type !== type) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}
