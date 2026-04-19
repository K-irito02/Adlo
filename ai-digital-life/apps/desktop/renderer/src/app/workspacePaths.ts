import type { DiagnosticSummary } from "@ai-digital-life/kernel";

export function normalizeWorkspaceRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").trim();
}

export function mergeDirtyEditorPaths(current: string[], path: string, isDirty: boolean): string[] {
  const norm = normalizeWorkspaceRelativePath(path);
  if (!norm) {
    return current;
  }
  const set = new Set(current.map((entry) => normalizeWorkspaceRelativePath(entry)));
  if (isDirty) {
    set.add(norm);
  } else {
    set.delete(norm);
  }
  return [...set];
}

export function filterDiagnosticsForPath(diagnostics: DiagnosticSummary[], filePath?: string) {
  const normalizedTarget = filePath?.replace(/\\/g, "/").toLowerCase();
  if (!normalizedTarget) {
    return diagnostics;
  }

  return diagnostics.filter((diagnostic) => {
    const normalizedDiagnosticPath = diagnostic.path?.replace(/\\/g, "/").toLowerCase();
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
    case "tsx":
      return "typescript";
    case "js":
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

export function findFirstDiagnostic(diagnostics: DiagnosticSummary[]) {
  return diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? diagnostics[0];
}
