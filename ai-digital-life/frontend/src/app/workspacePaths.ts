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
    case "mjs":
      return "javascript";
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "html":
    case "htm":
      return "html";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "md":
    case "markdown":
      return "markdown";
    case "sql":
      return "sql";
    case "py":
      return "python";
    case "rs":
      return "rust";
    case "xml":
    case "svg":
      return "xml";
    case "txt":
    default:
      return "plaintext";
  }
}

export function findFirstDiagnostic(diagnostics: DiagnosticSummary[]) {
  return diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? diagnostics[0];
}
