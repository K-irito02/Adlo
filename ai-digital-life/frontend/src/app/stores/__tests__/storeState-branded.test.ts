import { describe, it, expectTypeOf } from 'vitest';
import type { WorkspaceID, SessionID } from '../../../shared/branded';
import type { StoreState } from '../StoreState';

describe('StoreState with branded IDs', () => {
  it('WorkspaceActions.openWorkspace accepts WorkspaceID, not plain string', () => {
    expectTypeOf<(id: WorkspaceID) => Promise<void>>().toBeCallableWith('ws_123' as WorkspaceID);
    // @ts-expect-error: plain string should not be assignable to WorkspaceID without cast
    expectTypeOf<(id: WorkspaceID) => Promise<void>>().toBeCallableWith('ws_123');
  });

  it('SessionActions.createSession accepts optional WorkspaceID', () => {
    expectTypeOf<(id?: WorkspaceID) => Promise<void>>().toBeCallableWith('ws_456' as WorkspaceID);
    expectTypeOf<(id?: WorkspaceID) => Promise<void>>().toBeCallableWith(undefined);
  });

  it('SessionActions.selectSession accepts SessionID', () => {
    expectTypeOf<(id: SessionID) => Promise<void>>().toBeCallableWith('sess_789' as SessionID);
    // @ts-expect-error: WorkspaceID is not SessionID
    expectTypeOf<(id: SessionID) => Promise<void>>().toBeCallableWith('ws_000' as WorkspaceID);
  });
});

describe('StoreState composition', () => {
  it('should include workspace actions', () => {
    expectTypeOf<Pick<StoreState, 'openWorkspace' | 'clearWorkspaceContext'>>().toBeObject();
  });

  it('should include session actions', () => {
    expectTypeOf<Pick<StoreState, 'sendMessage' | 'createSession'>>().toBeObject();
  });

  it('should include root-level fields', () => {
    expectTypeOf<Pick<StoreState, 'loading' | 'appReady' | 'isTauri' | 'bootstrap'>>().toBeObject();
  });

  it('should include git actions', () => {
    expectTypeOf<Pick<StoreState, 'loadGitSnapshot' | 'switchGitBranch'>>().toBeObject();
  });

  it('should include mcp actions', () => {
    expectTypeOf<Pick<StoreState, 'fetchMcpServers' | 'addMcpServer'>>().toBeObject();
  });
});
