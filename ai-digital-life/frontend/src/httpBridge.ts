/**
 * httpBridge — a `DigitalLifeBridge` implementation that runs every business
 * domain over plain `fetch` against the standalone ad-server HTTP API
 * (`crates/server`). Every business method maps 1:1 to an `IpcResult`-shaped
 * route from `crates/server/src/router.rs`:
 *
 *   - request bodies are JSON objects with **camelCase** field names matching
 *     the frontend contract args (the handlers deserialize `rename_all =
 *     "camelCase"` structs),
 *   - responses are `IpcResult<T>` wire shapes (`{ ok, data }` /
 *     `{ ok: false, error: { code, message } }`),
 *   - a non-2xx response is a server-structured error and is passed through;
 *     a non-2xx with an unparseable body degrades to `HTTP__ERROR`, and a
 *     network failure to `NETWORK_ERROR`.
 *
 * System (shell) domains — `window`, `app`, `browser`, `pty`, `reserved`,
 * `setLogMode` and the four `subscribe*` streams — have no fetch routes:
 * they are typed fallbacks here. The Tauri shell (`tauri-bridge`) and browser
 * preview (`preview-bridge`) override them with their real implementations.
 * The `subscribe*` streams run over the ad-server SSE `/event` endpoint
 * (`EventSource`): `subscribeModelStream` maps `message.part.delta` /
 * `message.updated`, `subscribeRunActivity` maps tool-part run phases,
 * `subscribeTerminalStream` maps bash tool output, and `subscribePtyOutput`
 * reuses the shared `/pty` WebSocket client (Task 6).
 */
import type {
  AgentRunStatus,
  AppInfo,
  AppPreferencePatch,
  CiStatusSnapshot,
  CommandRequest,
  CommandRunResult,
  FileOutlineItem,
  HealthSnapshot,
  IpcResult,
  ModelGatewayHealthSnapshot,
  ModelTokenUsage,
  RuntimeDiagnosticsSnapshot,
} from '@ai-digital-life/kernel';
import type { DigitalLifeBridge } from './shared/ipc/digital-life';
import type { AppBridge } from './shared/ipc/app';
import type { AgentConfig } from './shared/ipc/agent';
import type { PtyOutputEvent, PtySessionInfo } from './shared/ipc/pty';
import type { AcpConfig, CodeModeConfig, HttpApiConfig } from './shared/ipc/reserved';
import type {
  ConnectionTestResult,
  FetchModelsResult,
  ProviderInfo,
  ProviderStatus,
} from './shared/ipc/provider';
import type {
  ApprovalRequestSummary,
  AuditEntry,
  CheckpointPayloadPreview,
  TaskCenterSnapshot,
} from '@ai-digital-life/kernel';
import type {
  AgentRunDetail,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
  GitBranchSummary,
  GitSnapshot,
  GitVisBranchGraph,
  GitVisCodeEvolution,
  GitVisCommitStats,
  GitVisContributorModules,
  GitVisFileHotspots,
  PatchApplicationResult,
  PatchSet,
  RecentWorkspaceEntry,
  ReorderSessionsInput,
  RepoMapNode,
  RetrievalSnapshot,
  SessionMessagesPayload,
  WorkspaceChangePreview,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';
import type { CommandsConfigBridge, ConversationBridge, WorkspaceBridge } from './shared/ipc';
import type { CommandConfig } from './shared/ipc/commands_config';
import type { CompactSessionInput, CompactSessionResult } from './shared/ipc/compaction';
import type { McpCatalog, McpServerConfig, McpServerInfo } from './shared/ipc/mcp';
import type { SnapshotRecord, RevertResult } from './shared/ipc/snapshot';
import type { WebFetchResult, WebSearchResult } from './shared/ipc/web_tools';
import type { ReferenceConfig } from './shared/ipc/reference';
import type {
  PermissionDecision,
  PermissionRule,
  PermissionRulesetConfig,
} from './shared/ipc/permission';
import type { SubagentTask, TaskToolInput, TaskToolOutput } from './shared/ipc/subagent';
import type { SymbolInfo, DiagnosticInfo } from './shared/ipc/lsp';
import type { DurableSessionState } from './shared/ipc/durable';
import type { SseWireEvent } from './app/features/part-stream/partStoreTypes';
import { repoMapEntriesToTree } from './shared/repoMapFromEntries';
import {
  subscribeEventSource,
  SSE_LIVE_ONLY_AFTER,
  type EventSourceFactory,
} from './httpBridge/event-source';
import { createPtyWsClient, type PtyWsClient, type PtyWsClientOptions } from './shared/ipc/pty-ws';

/** Default ad-server address until the dev-script port injection (Task 9). */
export const DEFAULT_ADL_SERVER_BASE_URL = 'http://127.0.0.1:61234';

/**
 * Resolve the ad-server base URL: `VITE_ADL_SERVER_URL` wins when set,
 * otherwise the default `http://127.0.0.1:61234`. Task 9 replaces the fallback
 * with the port the dev script discovers.
 */
export function resolveAdlServerBaseUrl(): string {
  const fromEnv = (import.meta.env?.VITE_ADL_SERVER_URL as string | undefined)?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, '');
  }
  return DEFAULT_ADL_SERVER_BASE_URL;
}

export interface HttpBridgeOptions {
  baseUrl: string;
  /** Injectable EventSource constructor (defaults to the global one). */
  eventSourceFactory?: EventSourceFactory;
  /** Initial `?after=` resume point (event_log seq) for the `/event` stream. */
  lastEventId?: number;
  /** Options for the reused `/pty` WebSocket client (tests inject `wsFactory`). */
  ptyWsOptions?: PtyWsClientOptions;
}

const HTTP_ERROR_CODE = 'HTTP__ERROR';
const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
const NOT_SUPPORTED_CODE = 'NOT_SUPPORTED';

function notSupported<T>(what: string): IpcResult<T> {
  return {
    ok: false,
    error: {
      code: NOT_SUPPORTED_CODE,
      message: `[httpBridge] ${what} is a Tauri shell capability with no ad-server HTTP route; the shell bridge overrides it.`,
    },
  };
}

/**
 * Perform a JSON fetch against `baseUrl + path` and decode the `IpcResult<T>`
 * wire shape. A non-2xx response from the ad-server is still a structured
 * `IpcResult` error body — it is passed through when parseable.
 */
async function call<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  f: typeof fetch = fetch,
): Promise<IpcResult<T>> {
  try {
    const resp = await f(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!resp.ok) {
      try {
        const json = (await resp.json()) as IpcResult<T>;
        if (json && typeof json === 'object' && 'ok' in json) {
          return json;
        }
      } catch {
        // non-JSON error body — fall through to the generic HTTP error
      }
      return {
        ok: false,
        error: { code: HTTP_ERROR_CODE, message: `HTTP ${resp.status}` },
      };
    }
    return (await resp.json()) as IpcResult<T>;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: NETWORK_ERROR_CODE, message } };
  }
}

const jsonBody = (body: unknown): string => JSON.stringify(body ?? {});

const GET = (): RequestInit => ({ method: 'GET' });
const POST = (body: unknown): RequestInit => ({ method: 'POST', body: jsonBody(body) });
const PATCH = (body: unknown): RequestInit => ({ method: 'PATCH', body: jsonBody(body) });
const DELETE = (): RequestInit => ({ method: 'DELETE' });

const taskNotSupported = <T>(what: string): Promise<IpcResult<T>> =>
  Promise.resolve(notSupported<T>(what));

/**
 * POST a JSON body and decode `IpcResult<T>` from the response, tolerating an
 * EMPTY success body. The question-reply route (`POST /question/{id}/reply`,
 * `crates/server/src/sse_server.rs`) is an axum `Result<(), _>` handler whose
 * 200 response carries no JSON — `call` would choke on `resp.json()`. This
 * variant treats any 2xx with an empty body as `{ ok: true }` (the caller maps
 * it to `data: true`).
 */
async function callEmptyOk<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  f: typeof fetch = fetch,
): Promise<IpcResult<T>> {
  try {
    const resp = await f(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!resp.ok) {
      try {
        const json = (await resp.json()) as IpcResult<T>;
        if (json && typeof json === 'object' && 'ok' in json) {
          return json;
        }
      } catch {
        // non-JSON error body — fall through to the generic HTTP error
      }
      return {
        ok: false,
        error: { code: HTTP_ERROR_CODE, message: `HTTP ${resp.status}` },
      };
    }
    const text = await resp.text();
    if (text.length === 0) {
      return { ok: true, data: true as T };
    }
    try {
      return JSON.parse(text) as IpcResult<T>;
    } catch {
      return { ok: true, data: true as T };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: NETWORK_ERROR_CODE, message } };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Task 8 — SSE `/event` → v1 stream mapping.
//
// The ad-server `/event` stream (crates/server/src/sse_server.rs) carries
// `SessionPartEvent` JSON records (camelCase, `type` discriminator):
//   message.part.updated / message.part.delta / message.created /
//   message.updated / session.status / question.asked / question.replied
// Each record also carries the event_log `id:` (Last-Event-ID resume point).
// These helpers map the wire records into the frontend v1 stream contracts.
// ═══════════════════════════════════════════════════════════════════════════

/** Decode an SSE `data:` JSON payload, or `null` for malformed records. */
function parseSseWire(data: string): Record<string, unknown> | null {
  try {
    const wire = JSON.parse(data) as unknown;
    if (wire !== null && typeof wire === 'object' && !Array.isArray(wire)) {
      return wire as Record<string, unknown>;
    }
  } catch {
    // malformed record — ignore
  }
  return null;
}

/**
 * Narrow a decoded `/event` wire record into a `SseWireEvent` by its `type`
 * discriminator. This is the boundary cast: the SSE infra delivers records as
 * `Record<string, unknown>`, and the S2 PartStore consumes the FULL raw wire
 * (no v1 mapping — unlike the Task 8 model/activity/terminal mappers, which
 * drop message.created / question.*). Records whose `type` is not part of the
 * SessionPartEvent union are dropped at the boundary.
 */
function parseSessionPartEvent(wire: Record<string, unknown>): SseWireEvent | null {
  const t = wire.type;
  if (
    t !== 'message.created' &&
    t !== 'message.updated' &&
    t !== 'message.part.updated' &&
    t !== 'message.part.delta' &&
    t !== 'session.status' &&
    t !== 'question.asked' &&
    t !== 'question.replied'
  ) {
    return null;
  }
  return wire as unknown as SseWireEvent;
}

/**
 * Create the model-stream wire mapper. Stateful: tracks each part's type from
 * its `message.part.updated` announcement so `message.part.delta` records can
 * be classified.
 *
 *   - `message.part.updated` → records the part type (text / reasoning / tool)
 *   - `message.part.delta` (field "text", part type text or unknown) → text delta
 *   - `message.part.delta` (field "text", part type reasoning) → **dropped**:
 *     the loop executor publishes reasoning increments with `field: "text"`
 *     (server-side conflation, see task-8-report), and reasoning must not leak
 *     into the chat text. This mirrors the desktop `reasoning-delta` channel,
 *     which the v1 UI ignores (so desktop never shows reasoning in chat).
 *   - `message.updated` info.error → error; info.usage → usage; finish → done
 *
 * The `runId` is the assistant `messageID` (ad-server sets assistant message
 * id == run id, so the streaming deltas carry the run id on the wire).
 */
function createModelStreamMapper(): (
  wire: Record<string, unknown>,
  seq: number,
) => DigitalLifeModelStreamEventV1[] {
  // partID → part type, learned from `message.part.updated` announcements. The
  // map is bounded (each run has a handful of parts) and re-learned whenever a
  // `message.part.updated` record arrives, so it never needs manual eviction.
  const partTypes = new Map<string, string>();
  return (wire, seq) => {
    if (wire.type === 'message.part.updated') {
      const part = (wire.part ?? {}) as Record<string, unknown>;
      const data = (part.data ?? {}) as Record<string, unknown>;
      if (typeof wire.partID === 'string' && typeof data.type === 'string') {
        partTypes.set(wire.partID, data.type);
      }
      return [];
    }
    if (wire.type === 'message.part.delta') {
      const field = wire.field as string | undefined;
      const delta = wire.delta as string | undefined;
      const messageID = wire.messageID as string | undefined;
      if (field !== 'text' || typeof delta !== 'string' || typeof messageID !== 'string') {
        return [];
      }
      // A part announced as `reasoning` streams its increments with field
      // "text"; drop them so reasoning never appears in the assistant text.
      // Unknown parts (e.g. a stream resumed mid-part) default to text so no
      // legitimate text delta is lost.
      if (typeof wire.partID === 'string' && partTypes.get(wire.partID) === 'reasoning') {
        return [];
      }
      return [{ v: 1, runId: messageID, seq, type: 'delta', text: delta }];
    }
    if (wire.type === 'message.updated') {
      const info = (wire.info ?? {}) as {
        id?: string;
        finish?: string;
        usage?: ModelTokenUsage;
        error?: string;
      };
      const runId = info.id ?? (wire.sessionID as string | undefined);
      if (!runId) {
        return [];
      }
      if (typeof info.error === 'string') {
        return [{ v: 1, runId, seq, type: 'error', message: info.error }];
      }
      // Lossless: mirror the old Tauri stream which emitted `usage` then `done`
      // at the end of a successful run.
      const events: DigitalLifeModelStreamEventV1[] = [];
      if (info.usage) {
        events.push({ v: 1, runId, seq, type: 'usage', usage: info.usage });
      }
      if (info.finish === 'completed') {
        events.push({ v: 1, runId, seq: seq + events.length, type: 'done' });
      }
      return events;
    }
    return [];
  };
}

/**
 * Map a terminal `session.status` value onto the v1 `run-done` `AgentRunStatus`
 * vocabulary. The ad-server canonicalizes loop outcomes to `"active"` (idle),
 * `"cancelled"` and `"error"` (see `agent_loop.rs` `canonical_terminal_status`).
 */
function terminalSessionStatus(status: string): AgentRunStatus | undefined {
  switch (status) {
    case 'active':
      return 'succeeded';
    case 'cancelled':
      return 'aborted';
    case 'error':
      return 'failed';
    default:
      return undefined;
  }
}

/**
 * Create the run-activity wire mapper. Stateful: tracks which sessions went
 * `busy` in this subscription so a terminal `session.status` only synthesizes a
 * `run-done` for a transition we actually observed (a resting session replayed
 * at subscribe time must not emit a spurious run-done). Also tracks each busy
 * session's **run id** (learned from the message events the loop publishes —
 * `message.part.updated` / `message.part.delta` carry `messageID`, and
 * `message.created` / `message.updated` carry `info.id`, where the assistant
 * message id == run id on the converged wire) so the terminal `run-done` is
 * keyed by the run id, not the session id (Finding 3: `runActivityByRunId`
 * must hold every event of the run, including the terminal line).
 *
 * Tool parts (`message.part.updated`) map to the agent run phases (command /
 * search / file-read / patch / approval). The remaining v1 event types that are
 * synthesizable from the wire:
 *   - `message.updated.info.usage` → `{type:'model', phase:'done', usage}`
 *     (runId = assistant messageID == run id) so `setRunUsage` fires.
 *   - `message.updated.info.error` → `{type:'model', phase:'error', message}`
 *   - `session.status` busy → terminal → `{type:'run-done', status}`
 *   - `question.replied` → `{type:'approval', phase:'decided'}`
 * Wire-impossible gaps (flagged for Task 9/10): `run-start` (needs `scenario`),
 * `context-added`, and `patch.phase:'rolled-back'` (apply_patch only publishes
 * pending/running/completed/error on the wire).
 */
function createRunActivityMapper(): (
  wire: Record<string, unknown>,
  seq: number,
) => DigitalLifeRunActivityEventV1[] {
  const busySessions = new Set<string>();
  const sessionRunIds = new Map<string, string>();
  return (wire, seq) => {
    const sessionID = wire.sessionID as string | undefined;
    // Learn the run id for a busy session from any message event the loop
    // publishes (assistant message id == run id on the converged wire).
    if (typeof sessionID === 'string' && typeof wire.messageID === 'string') {
      sessionRunIds.set(sessionID, wire.messageID);
    } else if (typeof sessionID === 'string' && wire.type === 'message.updated') {
      const info = (wire.info ?? {}) as { id?: string };
      if (typeof info.id === 'string') {
        sessionRunIds.set(sessionID, info.id);
      }
    }
    if (wire.type === 'session.status') {
      const sessionID = wire.sessionID as string | undefined;
      const status = wire.status as string | undefined;
      if (!sessionID || !status) {
        return [];
      }
      if (status === 'busy') {
        busySessions.add(sessionID);
        return [];
      }
      if (!busySessions.has(sessionID)) {
        return [];
      }
      busySessions.delete(sessionID);
      const runStatus = terminalSessionStatus(status);
      if (!runStatus) {
        return [];
      }
      const runId = sessionRunIds.get(sessionID) ?? sessionID;
      sessionRunIds.delete(sessionID);
      return [{ v: 1, runId, seq, ts: Date.now(), type: 'run-done', status: runStatus }];
    }
    if (wire.type === 'question.replied') {
      const sessionID = wire.sessionID as string | undefined;
      const requestID = wire.requestID as string | undefined;
      if (!sessionID || !requestID) {
        return [];
      }
      // A reply with no answers is a rejection; otherwise the answers are opaque
      // values the wire cannot classify as approved/rejected.
      const answers = Array.isArray(wire.answers) ? wire.answers : [];
      const decision: 'approved' | 'rejected' | undefined =
        answers.length === 0 ? 'rejected' : undefined;
      return [
        decision
          ? {
              v: 1,
              runId: sessionID,
              seq,
              ts: Date.now(),
              type: 'approval',
              phase: 'decided',
              approvalId: requestID,
              decision,
            }
          : {
              v: 1,
              runId: sessionID,
              seq,
              ts: Date.now(),
              type: 'approval',
              phase: 'decided',
              approvalId: requestID,
            },
      ];
    }
    if (wire.type === 'message.updated') {
      const info = (wire.info ?? {}) as {
        id?: string;
        error?: unknown;
        usage?: ModelTokenUsage;
      };
      const runId = info.id ?? (wire.sessionID as string | undefined);
      if (!runId) {
        return [];
      }
      if (info.error !== undefined && info.error !== null) {
        return [
          {
            v: 1,
            runId,
            seq,
            ts: Date.now(),
            type: 'model',
            phase: 'error',
            message: String(info.error),
          },
        ];
      }
      if (info.usage) {
        return [
          { v: 1, runId, seq, ts: Date.now(), type: 'model', phase: 'done', usage: info.usage },
        ];
      }
      return [];
    }
    if (wire.type !== 'message.part.updated') {
      return [];
    }
    const part = (wire.part ?? {}) as Record<string, unknown>;
    const data = (part.data ?? {}) as Record<string, unknown>;
    if (data.type !== 'tool' || typeof data.tool !== 'string') {
      return [];
    }
    const state = (data.state ?? {}) as Record<string, unknown>;
    const status = typeof state.status === 'string' ? state.status : '';
    const runId = (wire.messageID as string | undefined) ?? (part.messageID as string | undefined);
    if (!runId) {
      return [];
    }
    const ts = Date.now();
    const input = (state.input ?? {}) as Record<string, unknown>;
    const metadata = (state.metadata ?? {}) as Record<string, unknown>;
    const tool = data.tool;

    switch (tool) {
      case 'bash': {
        const command = typeof input.command === 'string' ? input.command : '';
        const exitCode = typeof metadata.exitCode === 'number' ? metadata.exitCode : undefined;
        const phase: 'start' | 'done' = status === 'running' ? 'start' : 'done';
        return [{ v: 1, runId, seq, ts, type: 'command', phase, command, exitCode }];
      }
      case 'read': {
        const path = typeof input.path === 'string' ? input.path : '';
        return [{ v: 1, runId, seq, ts, type: 'file-read', path }];
      }
      case 'grep':
      case 'glob':
      case 'list': {
        const query = typeof input.pattern === 'string' ? input.pattern : '';
        return [{ v: 1, runId, seq, ts, type: 'search', query }];
      }
      case 'apply_patch':
      case 'edit':
      case 'write': {
        const patchSetId =
          (data.callID as string | undefined) ?? (wire.partID as string | undefined) ?? '';
        // Only a completed apply_patch is `applied`; pending/running announce the
        // proposed change, and the wire carries no rolled-back state.
        const phase: 'proposed' | 'applied' = status === 'completed' ? 'applied' : 'proposed';
        return [{ v: 1, runId, seq, ts, type: 'patch', phase, patchSetId }];
      }
      case 'question': {
        const approvalId =
          (data.callID as string | undefined) ?? (wire.partID as string | undefined) ?? '';
        return [{ v: 1, runId, seq, ts, type: 'approval', phase: 'requested', approvalId }];
      }
      default:
        return [];
    }
  };
}

/**
 * Map a wire record to terminal-stream v1 events (`DigitalLifeTerminalStreamEventV1`).
 * A bash tool part carries the governed-command output; completed → stdout +
 * done, error → error. `executionId` is the tool `callID` (falling back to the
 * part id).
 */
function mapTerminalStreamWire(
  wire: Record<string, unknown>,
  seq: number,
): DigitalLifeTerminalStreamEventV1[] {
  if (wire.type !== 'message.part.updated') {
    return [];
  }
  const part = (wire.part ?? {}) as Record<string, unknown>;
  const data = (part.data ?? {}) as Record<string, unknown>;
  if (data.type !== 'tool' || data.tool !== 'bash') {
    return [];
  }
  const state = (data.state ?? {}) as Record<string, unknown>;
  const status = typeof state.status === 'string' ? state.status : '';
  const executionId =
    (data.callID as string | undefined) ?? (wire.partID as string | undefined) ?? '';
  if (!executionId) {
    return [];
  }
  if (status === 'completed') {
    const output = typeof state.output === 'string' ? state.output : '';
    const metadata = (state.metadata ?? {}) as Record<string, unknown>;
    const exitCode = typeof metadata.exitCode === 'number' ? metadata.exitCode : null;
    const events: DigitalLifeTerminalStreamEventV1[] = [];
    if (output) {
      events.push({ v: 1, executionId, seq, type: 'stdout', text: output });
    }
    events.push({
      v: 1,
      executionId,
      seq: seq + 1,
      type: 'done',
      exitCode,
      success: exitCode === 0,
      summary: `bash: exit ${exitCode ?? 'unknown'}`,
    });
    return events;
  }
  if (status === 'error') {
    const message = typeof state.error === 'string' ? state.error : 'bash tool failed';
    return [{ v: 1, executionId, seq, type: 'error', message }];
  }
  return [];
}

/**
 * Parse the SSE record `id:` (the event_log seq) into a positive integer, or
 * `undefined` when the record carries none (e.g. a malformed/absent id line).
 */
function parseRecordId(recordId: string | undefined): number | undefined {
  if (!recordId) {
    return undefined;
  }
  const n = Number(recordId);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/**
 * Open an `/event` EventSource and route mapped v1 events to `listener`.
 * Returns the synchronous `() => void` unsubscribe from the EventSource
 * wrapper. `seq` is a per-subscription monotonic counter (v1 semantics).
 *
 * `lastSeqRef.current` is the largest event_log seq this bridge has observed
 * (shared by all SSE streams). Every subscribe passes it as `?after=` so the
 * server replays nothing older than the resume point. A COLD subscribe (no
 * last-seen seq yet) opens `?after=latest` — the live-only sentinel — so it
 * streams events from now on instead of replaying the whole durable event_log
 * (the Task 8 flood). Each record's `id:` advances the ref.
 */
function subscribeSseMapped<T>(
  baseUrl: string,
  eventSourceFactory: EventSourceFactory | undefined,
  lastSeqRef: { current: number | undefined },
  mapper: (wire: Record<string, unknown>, seq: number) => T[],
): (listener: (event: T) => void) => () => void {
  return (listener) => {
    let seq = 0;
    const after = lastSeqRef.current;
    return subscribeEventSource({
      baseUrl,
      eventSourceFactory,
      // Cold subscribe (after === undefined) → `?after=latest` live-only;
      // otherwise resume from the last observed seq.
      lastEventId: after ?? SSE_LIVE_ONLY_AFTER,
      onEvent: (data, recordId) => {
        const recordSeq = parseRecordId(recordId);
        if (
          recordSeq !== undefined &&
          (lastSeqRef.current === undefined || recordSeq > lastSeqRef.current)
        ) {
          lastSeqRef.current = recordSeq;
        }
        // Defensive: never re-deliver a record at/before the resume point even
        // if a misbehaving server replays one (the server guarantees seq > after).
        // Skipped on the live-only cold path where there is no resume point.
        if (after !== undefined && recordSeq !== undefined && recordSeq <= after) {
          return;
        }
        const wire = parseSseWire(data);
        if (!wire) {
          return;
        }
        const events = mapper(wire, seq + 1);
        if (events.length === 0) {
          return;
        }
        seq += events.length;
        for (const event of events) {
          listener(event);
        }
      },
    });
  };
}

export function createHttpBridge({
  baseUrl,
  eventSourceFactory,
  lastEventId,
  ptyWsOptions,
}: HttpBridgeOptions): DigitalLifeBridge {
  // The `/pty` WebSocket client is shared across all `subscribePtyOutput`
  // listeners for this bridge instance (one socket, fanned out by pty-ws).
  let ptyClient: PtyWsClient | null = null;
  const getPtyClient = (): PtyWsClient => {
    ptyClient ??= createPtyWsClient(baseUrl, ptyWsOptions);
    return ptyClient;
  };

  // Largest event_log seq this bridge has observed, shared by all three SSE
  // subscriptions so a fresh subscribe opens `?after=<lastSeen>` (live-only)
  // instead of replaying the durable history. Seeded by the explicit option.
  const lastSeqRef: { current: number | undefined } = { current: lastEventId };

  return {
    // ── Stream subscriptions: EventSource against the ad-server /event SSE
    // stream (see crates/server/src/sse_server.rs). Each subscription opens its
    // own EventSource and maps the SessionPartEvent wire records to the v1
    // stream contract; `subscribePtyOutput` reuses the shared `/pty` WebSocket
    // client instead (Task 6).
    subscribeModelStream: subscribeSseMapped(
      baseUrl,
      eventSourceFactory,
      lastSeqRef,
      createModelStreamMapper(),
    ),
    subscribeRunActivity: subscribeSseMapped(
      baseUrl,
      eventSourceFactory,
      lastSeqRef,
      createRunActivityMapper(),
    ),
    subscribeTerminalStream: subscribeSseMapped(
      baseUrl,
      eventSourceFactory,
      lastSeqRef,
      mapTerminalStreamWire,
    ),
    // Raw SessionPartEvent subscription (S2 Part 渲染内核): reuses the same
    // `/event` EventSource infra + lastSeqRef as the mapped streams above, but
    // forwards EVERY parsed record verbatim (no v1 mapping) so the PartStore
    // reducer sees message.created / message.part.* / session.status /
    // question.*. The listener filters by `sessionID` itself.
    subscribeSessionPartEvents: subscribeSseMapped<SseWireEvent>(
      baseUrl,
      eventSourceFactory,
      lastSeqRef,
      (wire) => {
        const evt = parseSessionPartEvent(wire);
        return evt ? [evt] : [];
      },
    ),
    subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) =>
      getPtyClient().subscribePtyOutput(listener),

    setLogMode: async (_target: 'terminal' | 'debug', _mode: 'overwrite' | 'append' | 'multi') => {
      console.warn('[httpBridge] setLogMode is a Tauri shell capability; no-op over HTTP.');
    },

    // ── System (shell) domains: typed fallbacks — the shell bridges override.
    window: {
      minimize: () => Promise.resolve(),
      maximize: () => Promise.resolve(),
      close: () => Promise.resolve(),
      isMaximized: () => Promise.resolve(false),
      setTitle: () => Promise.resolve(),
      show: () => Promise.resolve(),
      onResized: () => () => {},
      openExternal: (url: string) => {
        if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        return Promise.resolve();
      },
    },
    app: {
      getInfo: () => taskNotSupported<AppInfo>('app.getInfo'),
      getHealth: () => taskNotSupported<HealthSnapshot>('app.getHealth'),
      getDiagnostics: () => taskNotSupported<RuntimeDiagnosticsSnapshot>('app.getDiagnostics'),
      getModelHealth: () => taskNotSupported<ModelGatewayHealthSnapshot>('app.getModelHealth'),
      updatePreferences: (_patch: AppPreferencePatch) =>
        taskNotSupported<AppInfo>('app.updatePreferences'),
    } satisfies AppBridge,
    browser: {
      createForTab: () => Promise.resolve(null),
      activateTab: () => Promise.resolve(),
      destroyTab: () => Promise.resolve(),
      navigateTab: () => Promise.resolve(),
      markNavigationIntent: () => Promise.resolve({ ok: true, data: null }),
      setTabBounds: () => Promise.resolve(),
      goBackTab: () => Promise.resolve(false),
      goForwardTab: () => Promise.resolve(false),
      canGoBackTab: () => Promise.resolve(false),
      canGoForwardTab: () => Promise.resolve(false),
      reloadTab: () => Promise.resolve(),
      onUrlChanged: () => () => {},
      onMetaChanged: () => () => {},
      onOpenNewTab: () => () => {},
      muteTab: () => Promise.resolve(),
      onAudioStateChanged: () => () => {},
      setBrowserColorScheme: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      clearCookies: () => Promise.resolve(),
      clearCache: () => Promise.resolve(),
    },
    pty: {
      create: () => taskNotSupported<{ sessionId: string }>('pty.create'),
      input: () => taskNotSupported<boolean>('pty.input'),
      resize: () => taskNotSupported<boolean>('pty.resize'),
      kill: () => taskNotSupported<boolean>('pty.kill'),
      list: () => taskNotSupported<PtySessionInfo[]>('pty.list'),
    },
    reserved: {
      acpGetStatus: () => taskNotSupported<unknown>('reserved.acpGetStatus'),
      acpGetConfig: () => taskNotSupported<AcpConfig>('reserved.acpGetConfig'),
      httpApiGetStatus: () => taskNotSupported<unknown>('reserved.httpApiGetStatus'),
      httpApiGetConfig: () => taskNotSupported<HttpApiConfig>('reserved.httpApiGetConfig'),
      codemodeExecute: () => taskNotSupported<unknown>('reserved.codemodeExecute'),
      codemodeGetConfig: () => taskNotSupported<CodeModeConfig>('reserved.codemodeGetConfig'),
    },

    // ── Workspace domain (workspace_* + sidebar + git + git-vis).
    workspace: {
      listRecent: () => call<RecentWorkspaceEntry[]>(baseUrl, '/sidebar/list', POST({})),
      open: (workspacePath: string) =>
        call<WorkspaceMeta>(baseUrl, '/workspace/open', POST({ workspacePath })),
      clearCurrent: () => call<boolean>(baseUrl, '/workspace/clear-current', POST({})),
      pickDirectory: () => taskNotSupported<string | undefined>('workspace.pickDirectory'),
      pin: (workspaceId: string) =>
        call<RecentWorkspaceEntry[]>(baseUrl, '/sidebar/pin', POST({ workspaceId })),
      unpin: (workspaceId: string) =>
        call<RecentWorkspaceEntry[]>(baseUrl, '/sidebar/unpin', POST({ workspaceId })),
      reorder: (input) => call<RecentWorkspaceEntry[]>(baseUrl, '/sidebar/reorder', POST(input)),
      removeFromSidebar: (workspaceId: string) =>
        call<RecentWorkspaceEntry[]>(baseUrl, '/sidebar/remove', POST({ workspaceId })),
      restoreToSidebar: (workspaceId: string) =>
        call<RecentWorkspaceEntry[]>(baseUrl, '/sidebar/restore', POST({ workspaceId })),
      listTreeForWorkspace: (workspacePath: string) =>
        call<WorkspaceTreeNode[]>(baseUrl, '/workspace/tree', POST({ workspacePath })),
      listGitStatusForWorkspace: (workspacePath: string) =>
        call<GitSnapshot>(baseUrl, '/workspace/git/status', POST({ workspacePath })),
      hideFromRightPanels: (workspaceId: string) =>
        call<RecentWorkspaceEntry[]>(baseUrl, '/sidebar/hide', POST({ workspaceId })),
      showInRightPanels: (workspaceId: string) =>
        call<RecentWorkspaceEntry[]>(baseUrl, '/sidebar/show', POST({ workspaceId })),
      revealInFileManager: (_workspacePath: string) =>
        taskNotSupported<boolean>('workspace.revealInFileManager'),
      createFile: (relativePath: string, content = '', workspacePath?: string) =>
        call<WorkspaceFileDocument>(
          baseUrl,
          '/workspace/file',
          POST({ relativePath, content, workspacePath }),
        ),
      createFolder: (relativePath: string, workspacePath?: string) =>
        call<boolean>(baseUrl, '/workspace/folder', POST({ relativePath, workspacePath })),
      readFile: (relativePath: string) =>
        call<WorkspaceFileDocument>(baseUrl, '/workspace/read', POST({ relativePath })),
      readFileForWorkspace: (workspacePath: string, relativePath: string) =>
        call<WorkspaceFileDocument>(
          baseUrl,
          '/workspace/read',
          POST({ workspacePath, relativePath }),
        ),
      getChangePreview: (relativePath: string) =>
        call<WorkspaceChangePreview>(baseUrl, '/workspace/change-preview', POST({ relativePath })),
      getChangePreviewForWorkspace: (workspacePath: string, relativePath: string) =>
        call<WorkspaceChangePreview>(
          baseUrl,
          '/workspace/change-preview',
          POST({ workspacePath, relativePath }),
        ),
      listTree: () => call<WorkspaceTreeNode[]>(baseUrl, '/workspace/tree', POST({})),
      search: (query: string) =>
        call<WorkspaceSearchHit[]>(baseUrl, '/workspace/search', POST({ query })),
      outline: (relativePath: string) =>
        call<FileOutlineItem[]>(baseUrl, '/workspace/outline', POST({ relativePath })),
      setEditorDirtyPaths: (relativePaths: string[]) =>
        call<boolean>(baseUrl, '/workspace/editor-dirty-paths', POST({ relativePaths })),
      renameFile: (relativePath: string, newName: string, workspacePath?: string) =>
        call<boolean>(baseUrl, '/workspace/rename', POST({ relativePath, newName, workspacePath })),
      deleteFile: (relativePath: string, workspacePath?: string) =>
        call<boolean>(baseUrl, '/workspace/delete', POST({ relativePath, workspacePath })),
      duplicateFile: (srcRelativePath: string, dstRelativePath: string, workspacePath?: string) =>
        call<boolean>(
          baseUrl,
          '/workspace/duplicate',
          POST({ relativePath: srcRelativePath, newPath: dstRelativePath, workspacePath }),
        ),
      getAbsolutePath: (relativePath: string, workspacePath?: string) =>
        call<string>(baseUrl, '/workspace/absolute-path', POST({ relativePath, workspacePath })),
      moveFile: (relativePath: string, newPath: string, workspacePath?: string) =>
        call<boolean>(baseUrl, '/workspace/move', POST({ relativePath, newPath, workspacePath })),
      onFileChanged: (_listener: (event: WorkspaceFileChangedEvent) => void) => {
        console.warn(
          '[httpBridge] workspace.onFileChanged is deferred to Task 8 (SSE event bridge); no-op for now.',
        );
        return () => {};
      },
      getGitStatus: () => call<GitSnapshot>(baseUrl, '/workspace/git/status', POST({})),
      listGitBranches: (rootPath?: string) =>
        call<GitBranchSummary[]>(
          baseUrl,
          '/workspace/git/branches',
          POST({ workspacePath: rootPath }),
        ),
      switchGitBranch: (input: WorkspaceGitBranchSwitchInput) =>
        call<WorkspaceGitBranchChangeResult>(baseUrl, '/workspace/git/switch', POST({ input })),
      createGitBranch: (input: WorkspaceGitBranchCreateInput) =>
        call<WorkspaceGitBranchChangeResult>(baseUrl, '/workspace/git/create', POST({ input })),
      stageFile: (relativePath: string, workspacePath?: string) =>
        call<void>(baseUrl, '/workspace/git/stage', POST({ relativePath, workspacePath })),
      unstageFile: (relativePath: string, workspacePath?: string) =>
        call<void>(baseUrl, '/workspace/git/unstage', POST({ relativePath, workspacePath })),
      discardFile: (relativePath: string, workspacePath?: string) =>
        call<void>(baseUrl, '/workspace/git/discard', POST({ relativePath, workspacePath })),
      gitVisCommitStats: (rootPath: string, since?: string, until?: string) =>
        call<GitVisCommitStats>(
          baseUrl,
          '/workspace/git-vis/commit-stats',
          POST({ rootPath, since, until }),
        ),
      gitVisCodeEvolution: (rootPath: string, since?: string, until?: string) =>
        call<GitVisCodeEvolution>(
          baseUrl,
          '/workspace/git-vis/code-evolution',
          POST({ rootPath, since, until }),
        ),
      gitVisContributorModules: (rootPath: string, since?: string, until?: string) =>
        call<GitVisContributorModules>(
          baseUrl,
          '/workspace/git-vis/contributor-modules',
          POST({ rootPath, since, until }),
        ),
      gitVisBranchGraph: (rootPath: string) =>
        call<GitVisBranchGraph>(baseUrl, '/workspace/git-vis/branch-graph', POST({ rootPath })),
      gitVisFileHotspots: (rootPath: string, since?: string, until?: string) =>
        call<GitVisFileHotspots>(
          baseUrl,
          '/workspace/git-vis/file-hotspots',
          POST({ rootPath, since, until }),
        ),
      gitVisFirstCommitYear: (rootPath: string) =>
        call<number | null>(baseUrl, '/workspace/git-vis/first-commit-year', POST({ rootPath })),
    } satisfies WorkspaceBridge,

    // ── Retrieval domain.
    retrieval: {
      getStatus: () => call<RetrievalSnapshot | undefined>(baseUrl, '/retrieval/status', GET()),
      getRepoMap: async (): Promise<IpcResult<RepoMapNode[]>> => {
        const snapshot = await call<RetrievalSnapshot | undefined>(
          baseUrl,
          '/retrieval/status',
          GET(),
        );
        if (!snapshot.ok) {
          return snapshot;
        }
        return { ok: true, data: repoMapEntriesToTree(snapshot.data?.repoMap ?? []) };
      },
      rebuildIndex: () => call<boolean>(baseUrl, '/retrieval/rebuild', POST({})),
    },

    // ── Conversation domain (session CRUD + messaging).
    conversation: {
      createSession: (title?: string, workspaceId?: string) =>
        call<ConversationSessionRecord>(baseUrl, '/session', POST({ title, workspaceId })),
      listSessions: () => call<ConversationSessionRecord[]>(baseUrl, '/sessions', GET()),
      getSession: (sessionId: string) =>
        call<ConversationDetail | undefined>(baseUrl, `/session/${sessionId}`, GET()),
      getSessionMessages: (sessionId: string) =>
        call<SessionMessagesPayload | undefined>(baseUrl, `/session/${sessionId}/message`, GET()),
      renameSession: (input: { sessionId: string; title: string }) =>
        call<ConversationSessionRecord>(
          baseUrl,
          `/session/${input.sessionId}`,
          PATCH({ title: input.title }),
        ),
      pinSession: (sessionId: string) =>
        call<ConversationSessionRecord>(baseUrl, `/session/${sessionId}`, PATCH({ pinned: true })),
      unpinSession: (sessionId: string) =>
        call<ConversationSessionRecord>(baseUrl, `/session/${sessionId}`, PATCH({ pinned: false })),
      reorderSessions: (input: ReorderSessionsInput) =>
        call<ConversationSessionRecord[]>(baseUrl, '/sessions/reorder', POST(input)),
      markSessionRead: (input: { sessionId: string; readAt?: number }) =>
        call<ConversationSessionRecord>(
          baseUrl,
          `/session/${input.sessionId}`,
          PATCH({ read: true, readAt: input.readAt }),
        ),
      markSessionUnread: (sessionId: string) =>
        call<ConversationSessionRecord>(baseUrl, `/session/${sessionId}`, PATCH({ unread: true })),
      archiveSession: (sessionId: string) =>
        call<ConversationSessionRecord>(baseUrl, `/session/${sessionId}`, PATCH({ archive: true })),
      archiveAllInWorkspace: () =>
        call<ConversationSessionRecord[]>(baseUrl, '/sessions/archive-all', POST({})),
      deleteSession: (sessionId: string) =>
        call<boolean>(baseUrl, `/session/${sessionId}`, DELETE()),
      sendMessage: (input: {
        sessionId: string;
        content: string;
        scenario?: 'chat' | 'plan' | 'code-edit';
        providerId?: string;
        modelId?: string;
      }) =>
        call<ConversationSendResult>(baseUrl, `/session/${input.sessionId}/message`, POST(input)),
      // The frontend passes a *run id*; the run-id abort route
      // `/agent/run/:run_id/abort` is the faithful HTTP equivalent of the Tauri
      // `conversation_cancel_message` (the `/session/:id/cancel` route is keyed
      // by session id and would miss the run record).
      cancelMessage: (runId: string) =>
        call<AgentRunDetail | undefined>(baseUrl, `/agent/run/${runId}/abort`, POST({})),
      // Question reply (AskCard → `question.asked` → POST /question/{id}/reply).
      // The route returns a bare 200 (no JSON body), so it uses the empty-ok
      // tolerant variant and reports the unit response as `data: true`.
      replyToQuestion: (requestId: string, answers: string[]) =>
        callEmptyOk<boolean>(
          baseUrl,
          `/question/${encodeURIComponent(requestId)}/reply`,
          POST({ answers }),
        ).then((res) => (res.ok ? { ok: true as const, data: true } : res)),
    } satisfies ConversationBridge,

    // ── Agent domain (run CRUD, listing, scenario selection, Plan Mode).
    agent: {
      startRun: (input: {
        sessionId: string;
        prompt: string;
        scenario?: 'chat' | 'plan' | 'code-edit';
      }) => call<ConversationSendResult>(baseUrl, '/agent/start-run', POST(input)),
      getRun: (runId: string) =>
        call<AgentRunDetail | undefined>(baseUrl, `/agent/run/${runId}`, GET()),
      retryRun: (runId: string) =>
        call<AgentRunDetail | undefined>(baseUrl, `/agent/run/${runId}/retry`, POST({})),
      abortRun: (runId: string) =>
        call<AgentRunDetail | undefined>(baseUrl, `/agent/run/${runId}/abort`, POST({})),
      listAgents: () => call<AgentConfig[]>(baseUrl, '/agent/list', GET()),
      selectAgent: (scenario: string, userPrompt: string) =>
        call<AgentConfig>(baseUrl, '/agent/select', POST({ scenario, userPrompt })),
      enterPlanMode: (workspaceId: string, workspaceRoot: string) =>
        call<string>(baseUrl, '/agent/plan-mode/enter', POST({ workspaceId, workspaceRoot })),
      exitPlanMode: (workspaceId: string) =>
        call<string | null>(baseUrl, '/agent/plan-mode/exit', POST({ workspaceId })),
      getPlanModeState: (workspaceId: string) =>
        call<boolean>(baseUrl, '/agent/plan-mode/state', POST({ workspaceId })),
    },

    // ── Sub-agent domain.
    subagent: {
      spawnSubagent: (parentSessionId: string, input: TaskToolInput) =>
        call<TaskToolOutput>(baseUrl, '/subagent/spawn', POST({ parentSessionId, input })),
      getSubagentTask: (taskId: string) =>
        call<SubagentTask | null>(baseUrl, '/subagent/get', POST({ taskId })),
      listActiveSubagents: (workspaceId: string) =>
        call<SubagentTask[]>(baseUrl, '/subagent/list-active', POST({ workspaceId })),
      cancelSubagent: (taskId: string) =>
        call<boolean>(baseUrl, '/subagent/cancel', POST({ taskId })),
    },

    // ── Patch domain.
    patch: {
      getPatchSet: (patchSetId: string) =>
        call<PatchSet | undefined>(baseUrl, `/patch/${patchSetId}`, GET()),
      setHunkDecision: (input: {
        patchSetId: string;
        hunkId: string;
        decision: 'pending' | 'accepted' | 'rejected';
      }) => call<PatchSet>(baseUrl, '/patch/hunk-decision', POST(input)),
      applyPatchSet: (patchSetId: string) =>
        call<PatchApplicationResult>(baseUrl, '/patch/apply', POST({ patchSetId })),
      rollbackPatchSet: (patchSetId: string) =>
        call<PatchSet>(baseUrl, '/patch/rollback', POST({ patchSetId })),
    },

    // ── Command domain (custom slash-command execution + recent history).
    command: {
      run: (input: { command: string; args: string[]; shell?: boolean }) =>
        call<CommandRunResult>(baseUrl, '/command/run', POST(input)),
      listRecent: (limit?: number) =>
        call<CommandRequest[]>(baseUrl, '/command/recent', POST({ limit })),
    },

    // ── Commands-config domain (custom slash-command config CRUD).
    commandsConfig: {
      listCustomCommands: (dataDir: string) =>
        call<CommandConfig[]>(baseUrl, '/commands-config/list', POST({ dataDir })),
      addCustomCommand: (dataDir: string, command: CommandConfig) =>
        call<CommandConfig[]>(baseUrl, '/commands-config/add', POST({ dataDir, command })),
      updateCustomCommand: (dataDir: string, name: string, command: CommandConfig) =>
        call<CommandConfig[]>(baseUrl, '/commands-config/update', POST({ dataDir, name, command })),
      deleteCustomCommand: (dataDir: string, name: string) =>
        call<CommandConfig[]>(baseUrl, '/commands-config/delete', POST({ dataDir, name })),
      renderCommandTemplate: (template: string, args: string[], workspace: string) =>
        call<string>(baseUrl, '/commands-config/render', POST({ template, args, workspace })),
    } satisfies CommandsConfigBridge,

    // ── Snapshot domain.
    snapshot: {
      createSnapshot: (params: {
        workspaceId: string;
        workspaceRoot: string;
        messageId: string;
        sessionId: string;
      }) => call<SnapshotRecord>(baseUrl, '/snapshot/create', POST(params)),
      listSnapshots: (workspaceId: string, workspaceRoot: string) =>
        call<SnapshotRecord[]>(baseUrl, '/snapshot/list', POST({ workspaceId, workspaceRoot })),
      revertToSnapshot: (workspaceId: string, workspaceRoot: string, snapshotId: string) =>
        call<RevertResult>(
          baseUrl,
          '/snapshot/revert',
          POST({ workspaceId, workspaceRoot, snapshotId }),
        ),
      pruneSnapshots: (workspaceId: string, workspaceRoot: string) =>
        call<number>(baseUrl, '/snapshot/prune', POST({ workspaceId, workspaceRoot })),
    },

    // ── Compaction domain.
    compaction: {
      compactSession: (input: CompactSessionInput) =>
        call<CompactSessionResult>(baseUrl, '/compaction/session', POST(input)),
    },

    // ── MCP domain.
    mcp: {
      listMcpServers: () => call<McpServerInfo[]>(baseUrl, '/mcp/list', POST({})),
      addMcpServer: (config: McpServerConfig) => call<void>(baseUrl, '/mcp/add', POST(config)),
      removeMcpServer: (name: string) => call<void>(baseUrl, '/mcp/remove', POST({ name })),
      connectMcpServer: (name: string) => call<void>(baseUrl, '/mcp/connect', POST({ name })),
      disconnectMcpServer: (name: string) => call<void>(baseUrl, '/mcp/disconnect', POST({ name })),
      getMcpCatalog: () => call<McpCatalog>(baseUrl, '/mcp/catalog', POST({})),
      loadMcpConfig: (path: string) => call<number>(baseUrl, '/mcp/load-config', POST({ path })),
    },

    // ── Provider domain. API keys travel in request bodies only; the server
    // credential store is write-only — `getProviderApiKey` never reads a key
    // back over HTTP (it maps to the presence check and returns null). The
    // desktop shell overrides `getProviderApiKey`/`hasProviderApiKey` in
    // `tauri-bridge/index.ts` to the Tauri invoke channel so the settings key
    // input can be re-filled after a restart — that is IPC, not HTTP.
    provider: {
      setProviderApiKey: (provider: string, apiKey: string) =>
        call<boolean>(baseUrl, '/provider/api-key', POST({ providerId: provider, apiKey })),
      clearProviderApiKey: (provider: string) =>
        call<boolean>(baseUrl, '/provider/api-key/clear', POST({ providerId: provider })),
      hasProviderApiKey: (provider: string) =>
        call<boolean>(baseUrl, '/provider/api-key/has', POST({ providerId: provider })),
      getProviderApiKey: async (provider: string) => {
        const res = await call<boolean>(
          baseUrl,
          '/provider/api-key/has',
          POST({ providerId: provider }),
        );
        return res.ok ? { ok: true as const, data: null } : res;
      },
      listSupportedProviders: () => call<ProviderInfo[]>(baseUrl, '/provider/supported', GET()),
      listProviders: () => call<ProviderStatus[]>(baseUrl, '/provider/list', GET()),
      saveProviderConfig: (providerId: string, config: Record<string, unknown>) =>
        call<void>(baseUrl, '/provider/config', POST({ providerId, config })),
      testProviderConnection: (providerId: string, apiKey?: string) =>
        call<ConnectionTestResult>(
          baseUrl,
          '/provider/test-connection',
          POST({ providerId, apiKey }),
        ),
      fetchProviderModels: (providerId: string, apiKey?: string) =>
        call<FetchModelsResult>(baseUrl, '/provider/fetch-models', POST({ providerId, apiKey })),
      addCustomProvider: (
        name: string,
        providerBaseUrl: string,
        apiKey: string,
        models: string[],
      ) =>
        call<boolean>(
          baseUrl,
          '/provider/custom',
          POST({ name, baseUrl: providerBaseUrl, apiKey, models }),
        ),
      removeCustomProvider: (providerId: string) =>
        call<boolean>(baseUrl, '/provider/custom/remove', POST({ providerId })),
    },

    // ── GitHub / CI domain (token is write-only — set/clear/has only).
    github: {
      getStatus: (config) => call<CiStatusSnapshot>(baseUrl, '/ci/status', POST(config)),
      getStatusWithoutToken: (owner: string, repo: string, branch: string) =>
        call<CiStatusSnapshot>(baseUrl, '/ci/status-without-token', POST({ owner, repo, branch })),
      setAccessToken: (token: string) =>
        call<boolean>(baseUrl, '/ci/access-token', POST({ token })),
      clearAccessToken: () => call<boolean>(baseUrl, '/ci/access-token/clear', POST({})),
      hasAccessToken: () => call<boolean>(baseUrl, '/ci/access-token/has', POST({})),
      getJobLogs: (config, runId) =>
        call<Record<number, string>>(baseUrl, '/ci/job-logs', POST({ config, runId })),
    },

    // ── Run-activity domain (history read).
    runActivity: {
      listByRunId: (runId: string, limit?: number) =>
        call<DigitalLifeRunActivityEventV1[]>(
          baseUrl,
          '/run-activity/list',
          POST({ runId, limit }),
        ),
    },

    // ── Web-tools domain.
    webTools: {
      webFetch: (url: string, format?: string) =>
        call<WebFetchResult>(baseUrl, '/web-tools/fetch', POST({ url, format })),
      webSearch: (query: string) =>
        call<WebSearchResult>(baseUrl, '/web-tools/search', POST({ query })),
    },

    // ── Permission ruleset domain.
    permission: {
      listPermissionRules: (dataDir: string) =>
        call<PermissionRulesetConfig>(baseUrl, '/permission/list', POST({ dataDir })),
      addPermissionRule: (dataDir: string, rule: PermissionRule) =>
        call<PermissionRulesetConfig>(baseUrl, '/permission/add', POST({ dataDir, rule })),
      deletePermissionRule: (dataDir: string, index: number) =>
        call<PermissionRulesetConfig>(baseUrl, '/permission/delete', POST({ dataDir, index })),
      setPermissionIncludeDefaults: (dataDir: string, include: boolean) =>
        call<PermissionRulesetConfig>(
          baseUrl,
          '/permission/include-defaults',
          POST({ dataDir, include }),
        ),
      evaluatePermission: (dataDir: string, toolName: string, command: string, args: string[]) =>
        call<PermissionDecision>(
          baseUrl,
          '/permission/evaluate',
          POST({ dataDir, toolName, command, args }),
        ),
    },

    // ── Session-fork domain.
    sessionFork: {
      forkSession: (parentSession: ConversationSessionRecord, forkMessageId: string) =>
        call<ConversationSessionRecord>(
          baseUrl,
          '/session-fork',
          POST({ parentSession, forkMessageId }),
        ),
      listSessionForks: (workspaceId: string, parentSessionId: string) =>
        call<ConversationSessionRecord[]>(
          baseUrl,
          '/session-fork/list',
          POST({ workspaceId, parentSessionId }),
        ),
    },

    // ── LSP domain.
    lsp: {
      startServer: (workspaceId: string, workspaceRoot: string, server: string) =>
        call<void>(baseUrl, '/lsp/start', POST({ workspaceId, workspaceRoot, server })),
      stopServer: (workspaceId: string, server: string) =>
        call<void>(baseUrl, '/lsp/stop', POST({ workspaceId, server })),
      getSymbols: (workspaceId: string, filePath: string) =>
        call<SymbolInfo[]>(baseUrl, '/lsp/symbols', POST({ workspaceId, filePath })),
      getDiagnostics: (workspaceId: string, filePath: string) =>
        call<DiagnosticInfo[]>(baseUrl, '/lsp/diagnostics', POST({ workspaceId, filePath })),
      gotoDefinition: (workspaceId: string, filePath: string, line: number, column: number) =>
        call<SymbolInfo | null>(
          baseUrl,
          '/lsp/goto-definition',
          POST({ workspaceId, filePath, line, column }),
        ),
    },

    // ── Reference domain.
    reference: {
      listReferences: (dataDir: string) =>
        call<ReferenceConfig[]>(baseUrl, '/reference/list', POST({ dataDir })),
      addReference: (dataDir: string, reference: ReferenceConfig) =>
        call<ReferenceConfig[]>(baseUrl, '/reference/add', POST({ dataDir, reference })),
      removeReference: (dataDir: string, name: string) =>
        call<ReferenceConfig[]>(baseUrl, '/reference/remove', POST({ dataDir, name })),
      getReferencesPrompt: (dataDir: string) =>
        call<string>(baseUrl, '/reference/prompt', POST({ dataDir })),
    },

    // ── Durable-session domain.
    durable: {
      registerDurableSession: (sessionId: string, runId: string) =>
        call<void>(baseUrl, '/durable/register', POST({ sessionId, runId })),
      heartbeatDurableSession: (sessionId: string) =>
        call<void>(baseUrl, '/durable/heartbeat', POST({ sessionId })),
      findCrashedSessions: () => call<DurableSessionState[]>(baseUrl, '/durable/crashed', POST({})),
      recoverSession: (sessionId: string) =>
        call<boolean>(baseUrl, '/durable/recover', POST({ sessionId })),
    },

    // ── Task-center / approval domain.
    task: {
      getSnapshot: () => call<TaskCenterSnapshot>(baseUrl, '/task/snapshot', POST({})),
      listPendingApprovals: () =>
        call<ApprovalRequestSummary[]>(baseUrl, '/task/pending-approvals', POST({})),
      getCheckpointPreview: (checkpointId: string) =>
        call<CheckpointPayloadPreview | undefined>(
          baseUrl,
          '/task/checkpoint-preview',
          POST({ checkpointId }),
        ),
      restoreCheckpoint: (checkpointId: string) =>
        call<TaskCenterSnapshot>(baseUrl, '/task/restore-checkpoint', POST({ checkpointId })),
      decideApproval: (input: {
        approvalId: string;
        decision: 'approved' | 'rejected';
        reason?: string;
      }) => call<TaskCenterSnapshot>(baseUrl, '/task/decide-approval', POST(input)),
      listAuditEntries: (limit?: number) =>
        call<AuditEntry[]>(baseUrl, '/task/audit-entries', POST({ limit })),
    },

    // ── Custom-agent registry domain.
    customAgent: {
      listCustomAgents: (dataDir: string) =>
        call<AgentConfig[]>(baseUrl, '/custom-agent/list', POST({ dataDir })),
      addCustomAgent: (dataDir: string, agent: AgentConfig) =>
        call<AgentConfig[]>(baseUrl, '/custom-agent/add', POST({ dataDir, agent })),
      deleteCustomAgent: (dataDir: string, name: string) =>
        call<AgentConfig[]>(baseUrl, '/custom-agent/delete', POST({ dataDir, name })),
    },
  };
}
