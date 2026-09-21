import { describe, it, expect } from 'vitest';
import { stripTokenFromConfig, stripTokenFromFolders } from './githubRepoSliceHelpers';

// hydrateGitHubRepoSlice 随 Task 29 删除（水合收归 hydrateAll）；此处覆盖保留下来的
// 落盘形状处理：token 剥离（写入侧恒不落 token，读侧恒为 null）。
describe('githubRepoSlice token stripping', () => {
  it('strips the accessToken from a workspace config before persistence', () => {
    expect(
      stripTokenFromConfig({
        owner: 'o',
        repo: 'r',
        branch: 'main',
        workflowId: null,
        accessToken: 'secret',
        configured: true,
      }),
    ).toEqual({
      owner: 'o',
      repo: 'r',
      branch: 'main',
      workflowId: null,
      accessToken: null,
      configured: true,
    });
  });

  it('strips accessTokens from folder configs, leaving tokenless folders untouched', () => {
    const folders = stripTokenFromFolders([
      {
        id: 'f1',
        name: 'a',
        createdAt: 1,
        ciConfig: {
          owner: 'o',
          repo: 'r',
          branch: 'main',
          workflowId: null,
          accessToken: 'secret',
          configured: true,
        },
      },
      { id: 'f2', name: 'b', createdAt: 2 },
    ]);
    expect(folders[0].ciConfig?.accessToken).toBeNull();
    expect(folders[1]).toEqual({ id: 'f2', name: 'b', createdAt: 2 });
  });
});
