import type { DiagnosticSummary, FilePatch } from "@ai-digital-life/kernel";

export interface EditorTabState {
  id: string;
  path: string;
  title: string;
}

function getFileName(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? filePath;
}

function normalizeFilePath(filePath?: string): string | undefined {
  return filePath?.replace(/\\/g, "/").toLowerCase();
}

export function createEditorTab(filePath: string): EditorTabState {
  return {
    id: filePath,
    path: filePath,
    title: getFileName(filePath)
  };
}

export function mapPatchToEditorTab(filePatch: FilePatch): EditorTabState {
  return createEditorTab(filePatch.relativePath);
}

export function findFirstDiagnostic(diagnostics: DiagnosticSummary[]): DiagnosticSummary | undefined {
  return diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? diagnostics[0];
}

export function filterDiagnosticsForPath(
  diagnostics: DiagnosticSummary[],
  filePath?: string
): DiagnosticSummary[] {
  const normalizedTarget = normalizeFilePath(filePath);
  if (!normalizedTarget) {
    return diagnostics;
  }

  return diagnostics.filter((diagnostic) => {
    const normalizedDiagnosticPath = normalizeFilePath(diagnostic.path);
    return normalizedDiagnosticPath ? normalizedDiagnosticPath.endsWith(normalizedTarget) : false;
  });
}

export function detectEditorLanguage(filePath?: string, fallbackLanguage?: string): string {
  if (fallbackLanguage) {
    return fallbackLanguage;
  }

  const extension = filePath?.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
      return "javascript";
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
      return "shell";
    default:
      return "plaintext";
  }
}
