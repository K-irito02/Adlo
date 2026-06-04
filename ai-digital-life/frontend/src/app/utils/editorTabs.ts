import type { FilePatch } from '@ai-digital-life/kernel';

export type EditorTabState = {
  id: string;
  path: string;
  title: string;
};

export function createEditorTab(filePath: string): EditorTabState {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  return {
    id: filePath,
    path: filePath,
    title: segments[segments.length - 1] ?? filePath,
  };
}

export function mapPatchToEditorTab(filePatch: FilePatch): EditorTabState {
  return createEditorTab(filePatch.relativePath);
}
