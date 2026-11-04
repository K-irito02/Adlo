// Wire-aligned TS mirrors of `crates/types/src/types/part.rs`.
//
// `MessageRecord` / `PartRecord` serialize camelCase (serde `rename_all =
// "camelCase"`); `PartData` is a discriminated union tagged on `type`
// (kebab-case, serde `tag = "type"`); `ToolState` is tagged on `status`.
// `serde_json::Value` fields (e.g. `MessageRecord.model`) map to `unknown`.

export type PartType =
  | 'text'
  | 'reasoning'
  | 'tool'
  | 'file'
  | 'step-start'
  | 'step-finish'
  | 'patch'
  | 'snapshot';

export interface MessageRecord {
  id: string;
  sessionID: string;
  role: string; // 'user' | 'assistant'
  parentID?: string;
  agent?: string;
  model?: unknown;
  summary?: unknown;
  timeCreated: number;
  timeCompleted?: number;
}

export interface ToolTime {
  start: number;
  end?: number;
}

export type ToolState =
  | { status: 'pending'; input: unknown }
  | { status: 'running'; input: unknown; title?: string; metadata?: unknown }
  | {
      status: 'completed';
      input: unknown;
      output: string;
      title?: string;
      metadata?: unknown;
      time: ToolTime;
    }
  | { status: 'error'; input: unknown; error: string; metadata?: unknown; time: ToolTime };

export interface TextPartData {
  text: string;
}
export interface ReasoningPartData {
  text: string;
}
export interface ToolPartData {
  tool: string;
  callID: string;
  state: ToolState;
}
export interface FilePartData {
  mime: string;
  filename?: string;
  url: string;
}
export interface PatchPartData {
  hash: string;
  files: string[];
}

export type PartData =
  | ({ type: 'text' } & TextPartData)
  | ({ type: 'reasoning' } & ReasoningPartData)
  | ({ type: 'tool' } & ToolPartData)
  | ({ type: 'file' } & FilePartData)
  | { type: 'step-start' }
  | { type: 'step-finish' }
  | ({ type: 'patch' } & PatchPartData)
  | { type: 'snapshot'; snapshot: string };

export interface PartRecord {
  id: string;
  messageID: string;
  sessionID: string;
  type: PartType;
  ordinal: number;
  timeCreated: number;
  data: PartData;
}

export interface SessionMessagesEntry {
  message: MessageRecord;
  parts: PartRecord[];
}
export interface SessionMessagesPayload {
  messages: SessionMessagesEntry[];
}
