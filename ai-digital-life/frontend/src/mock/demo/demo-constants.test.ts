import { describe, it, expect } from 'vitest';
import {
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_PATH,
  DEMO_WORKSPACE_NAME_MARKER,
  DEMO_SESSION_IDS,
  DEMO_DOCUMENTS,
} from './demo-constants';

describe('demo-constants', () => {
  it('defines the demo workspace identity', () => {
    expect(DEMO_WORKSPACE_ID).toBe('workspace-demo');
    expect(DEMO_WORKSPACE_PATH).toBe('demo://workspace');
    expect(DEMO_WORKSPACE_NAME_MARKER).toBe('i18n:demoWorkspaceName');
  });

  it('defines three demo session ids', () => {
    expect(DEMO_SESSION_IDS.complete).toBe('demo-session-complete');
    expect(DEMO_SESSION_IDS.plan).toBe('demo-session-plan');
    expect(DEMO_SESSION_IDS.tools).toBe('demo-session-tools');
  });

  it('seeds virtual documents that match message content references', () => {
    expect(DEMO_DOCUMENTS['frontend/src/main.tsx']).toBeTruthy();
    expect(DEMO_DOCUMENTS['README.md']).toBeTruthy();
    expect(DEMO_DOCUMENTS['Resume/index.html']).toBeTruthy();
  });
});
