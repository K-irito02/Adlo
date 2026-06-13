import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('./stores/slicedStore.ts', import.meta.url), 'utf8');
const cacheHelpersSource = readFileSync(
  new URL('./stores/cacheHelpers.ts', import.meta.url),
  'utf8'
);
const rightPanelSource = readFileSync(new URL('./regions/RightPanel.tsx', import.meta.url), 'utf8');
const filesPanelSource = readFileSync(
  new URL('./regions/right-panel/panels/FilesPanel.tsx', import.meta.url),
  'utf8'
);
const sidebarViewModelSource = readFileSync(
  new URL('./utils/sidebarViewModel.ts', import.meta.url),
  'utf8'
);
const lazyPreviewsSource = readFileSync(
  new URL('./features/preview/LazyPreviews.tsx', import.meta.url),
  'utf8'
);

describe('loading and switching performance guards', () => {
  it('does not replace the full application shell with a loading screen after mount', () => {
    expect(appSource).not.toContain('if (loading) {');
    expect(storeSource).not.toMatch(
      /bootstrap:\s*async\s*\(\)\s*=>\s*{\s*set\(\{\s*loading:\s*true/s
    );
  });

  it('keeps the current change preview visible while fetching the next file', () => {
    expect(storeSource).not.toContain('changePreviewLoading: true');
    expect(storeSource).not.toMatch(
      /changePreviewLoading:\s*true,\s*[\r\n]+\s*changePreview:\s*undefined/s
    );
  });

  it('uses silent lazy preview suspense fallbacks instead of visible loading text', () => {
    expect(lazyPreviewsSource).not.toContain('加载预览');
    expect(lazyPreviewsSource).not.toContain('adl-preview-loading');
  });

  it('keeps root shell subscriptions granular instead of subscribing to the full app store', () => {
    expect(appSource).not.toContain('const store = useAppStore();');
    expect(appSource).toContain('useAppStore((state) => state.error)');
  });

  it('renders all right-side tool panels and hides inactive ones via hidden attribute', () => {
    expect(rightPanelSource).toContain('function ActiveToolPanel');
    expect(rightPanelSource).toContain('hidden={activeTool !==');
  });

  it('guards async switch responses and caches editor previews in the renderer', () => {
    expect(cacheHelpersSource).toContain('workspaceRequestSeq');
    expect(cacheHelpersSource).toContain('sessionRequestSeq');
    expect(cacheHelpersSource).toContain('fileRequestSeq');
    expect(cacheHelpersSource).toContain('changePreviewRequestSeq');
    expect(cacheHelpersSource).toContain('CachedFileDocument');
    expect(cacheHelpersSource).toContain('CachedChangePreview');
    expect(cacheHelpersSource).toContain('setCachedLruTTL');
  });

  it('keeps hot sidebar and file search paths allocation conscious', () => {
    expect(sidebarViewModelSource).not.toContain(
      'sessionItems.filter((item) => item.session.workspaceId === workspace.id)'
    );
    expect(filesPanelSource).not.toContain('new RegExp(searchPattern.source, searchPattern.flags)');
  });

  it('keeps cache limits module-scoped and makes file preview defaults explicit', () => {
    expect(cacheHelpersSource).toMatch(/export const FILE_DOCUMENT_CACHE_LIMIT = 32;/);
    expect(cacheHelpersSource).toMatch(/export const CHANGE_PREVIEW_CACHE_LIMIT = 32;/);
    expect(filesPanelSource).toContain(
      "s.filePreviewModeByPath[selectedFilePath] ?? fileCategory === 'markdown'"
    );
  });
});
