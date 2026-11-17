// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const diffSection = readFileSync(
  new URL('../../regions/right-panel/panels/DiffEditorSection.tsx', import.meta.url),
  'utf8',
);

describe('变更面板媒体预览接线（事项4）', () => {
  it('媒体读取失败态带重试，且重试落在预览所属工作区', () => {
    expect(diffSection).toContain('changesPreviewMediaFailed');
    expect(diffSection).toMatch(/resolvePreviewOwner\(selectedChangePreviewWorkspaceId\)/);
    expect(diffSection).toMatch(/openChangePreviewForWorkspace\(owner.root, previewPath\)/);
    // 只有 workspaceId 缺省才回退当前工作区入口；id 不可解析时不得回退。
    expect(diffSection).toMatch(/selectedChangePreviewWorkspaceId === undefined/);
  });
});
