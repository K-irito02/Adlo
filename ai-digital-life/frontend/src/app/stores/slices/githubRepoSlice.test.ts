import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydrateGitHubRepoSlice } from './githubRepoSliceHelpers';

describe('hydrateGitHubRepoSlice', () => {
  let setMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setMock = vi.fn();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn(),
      },
    });
  });

  it('calls set with hydrated configs when localStorage has data', async () => {
    const configs = {
      'ws-1': {
        owner: 'octocat',
        repo: 'hello',
        branch: 'main',
        accessToken: null,
        configured: true,
        workflowId: null,
      },
    };
    vi.spyOn(globalThis, 'window', 'get').mockReturnValue({
      localStorage: { getItem: vi.fn().mockReturnValue(JSON.stringify(configs)) },
    } as unknown as Window & typeof globalThis);

    await hydrateGitHubRepoSlice(setMock);

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gitHubWorkspaceConfigs: expect.objectContaining({ 'ws-1': expect.anything() }),
      }),
    );
  });

  it('does not call set when localStorage is empty', async () => {
    vi.spyOn(globalThis, 'window', 'get').mockReturnValue({
      localStorage: { getItem: vi.fn().mockReturnValue(null) },
    } as unknown as Window & typeof globalThis);

    await hydrateGitHubRepoSlice(setMock);

    expect(setMock).not.toHaveBeenCalled();
  });

  it('guards against SSR (window undefined)', async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error simulate SSR
    delete globalThis.window;

    await expect(hydrateGitHubRepoSlice(setMock)).resolves.not.toThrow();
    expect(setMock).not.toHaveBeenCalled();

    globalThis.window = originalWindow;
  });
});
