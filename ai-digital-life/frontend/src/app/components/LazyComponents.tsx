import React, { Suspense } from 'react';
import {
  importDiffEditorSection,
  importEditorSurfaceShell,
  importGitVisualizationView,
} from './warmRightPanelEditors';

export const LazyDiffEditor = React.lazy(importDiffEditorSection);

export const LazyEditorSurface = React.lazy(importEditorSurfaceShell);

export const LazyGitVisualizationView = React.lazy(importGitVisualizationView);

export function ChunkLoadingFallback() {
  return <div className="skeleton" style={{ flex: 1 }} />;
}

export function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<ChunkLoadingFallback />}>{children}</Suspense>;
}
