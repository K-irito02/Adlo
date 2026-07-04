import { describe, it, expect } from 'vitest';
import { asWorkspaceID, asSessionID } from '../branded';
import type { WorkspaceID, SessionID } from '../branded';

describe('Branded types', () => {
  it('rejects assignment of one branded type to another', () => {
    const wid: WorkspaceID = asWorkspaceID('ws_123');
    // @ts-expect-error: SessionID is not assignable from WorkspaceID
    const sid: SessionID = wid;
    void sid;
  });

  it('accepts branded type where plain string is expected', () => {
    const wid: WorkspaceID = asWorkspaceID('ws_123');
    const plain: string = wid;
    expect(plain).toBe('ws_123');
  });

  it('requires explicit cast from plain string to branded', () => {
    const raw = 'ws_456';
    // Type assertion required — no implicit conversion
    const wid: WorkspaceID = raw as WorkspaceID;
    expect(wid).toBe('ws_456');
  });

  it('rejects plain string assignment without cast', () => {
    // @ts-expect-error: plain string not assignable to WorkspaceID
    const _wid: WorkspaceID = 'ws_123';
  });

  it('branded types work in object properties', () => {
    interface Store {
      activeSessionId: SessionID;
    }
    const sid: SessionID = asSessionID('sess_789');
    const store: Store = { activeSessionId: sid };
    expect(store.activeSessionId).toBe('sess_789');
  });
});
