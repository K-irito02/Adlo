declare const BrandSymbol: unique symbol;

export type Branded<T, B extends string> = T & { [BrandSymbol]: B };

export type WorkspaceID = Branded<string, 'WorkspaceID'>;
export type SessionID = Branded<string, 'SessionID'>;
export type TerminalSessionID = Branded<string, 'TerminalSessionID'>;
export type AgentRunID = Branded<string, 'AgentRunID'>;

export function asWorkspaceID(value: string): WorkspaceID {
  return value as WorkspaceID;
}

export function asSessionID(value: string): SessionID {
  return value as SessionID;
}

export function asTerminalSessionID(value: string): TerminalSessionID {
  return value as TerminalSessionID;
}

export function asAgentRunID(value: string): AgentRunID {
  return value as AgentRunID;
}
