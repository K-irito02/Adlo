import { describe, expect, it } from 'vitest';
import { clearedChangePreviewState } from './cacheHelpers';

describe('clearedChangePreviewState', () => {
  it('clears both text and media preview fields in one patch', () => {
    expect(clearedChangePreviewState()).toEqual({
      selectedChangePreviewPath: undefined,
      selectedChangePreviewWorkspaceId: undefined,
      changePreview: undefined,
      changePreviewLoading: false,
      changePreviewMedia: null,
      changePreviewMediaLoading: false,
      changePreviewMediaError: null,
    });
  });
});
