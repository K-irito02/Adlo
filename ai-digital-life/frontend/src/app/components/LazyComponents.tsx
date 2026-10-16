import React, { Suspense } from 'react';

export const LazyDiffEditor = React.lazy(() =>
  import('@regions/right-panel/panels/DiffEditorSection').then((m) => ({
    default: m.DiffEditorSection,
  })),
);

export const LazyEditorSurface = React.lazy(() =>
  import('@regions/right-panel/EditorSurfaceShell').then((m) => ({
    default: m.EditorSurfaceShell,
  })),
);

export const LazyGitVisualizationView = React.lazy(() =>
  import('@features/git-visualization').then((m) => ({
    default: m.GitVisualizationView,
  })),
);

export function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="skeleton" style={{ flex: 1 }} />}>{children}</Suspense>
  );
}
