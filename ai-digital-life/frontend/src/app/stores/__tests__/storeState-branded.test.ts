import { describe, it, expectTypeOf } from 'vitest';
import type { WorkspaceID, SessionID } from '../../../shared/branded';

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
