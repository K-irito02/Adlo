import { useCallback, useEffect, useRef, useState } from "react";

function buildDefaultCreationPath(
  selectedFilePath: string | undefined,
  fallbackName: string,
): string {
  const normalized = selectedFilePath ?? "";
  if (!normalized) {
    return fallbackName;
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return fallbackName;
  }
  return `${segments.slice(0, -1).join("/")}/${fallbackName}`;
}

function normalizeCreationPath(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  if (
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\")
  ) {
    return undefined;
  }
  const normalized = trimmed.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) {
    return undefined;
  }
  return segments.join("/");
}

interface UseFileCreationInput {
  selectedFilePath: string | undefined;
  onCreateWorkspaceFile: (path: string, content?: string) => Promise<string | undefined>;
  onCreateWorkspaceFolder: (path: string) => Promise<string | undefined>;
  expandFileTreePathChain: (path: string) => void;
  setFileTreePathExpanded: (path: string, expanded: boolean) => void;
}

interface UseFileCreationResult {
  createTarget: "file" | "folder" | null;
  createPathValue: string;
  createInputRef: React.RefObject<HTMLInputElement | null>;
  startCreate: (target: "file" | "folder") => void;
  cancelCreate: () => void;
  submitCreate: () => Promise<void>;
  setCreatePathValue: (value: string) => void;
}

function useFileCreation(input: UseFileCreationInput): UseFileCreationResult {
  const [createTarget, setCreateTarget] = useState<"file" | "folder" | null>(null);
  const [createPathValue, setCreatePathValue] = useState("");
  const createInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!createTarget) {
      return;
    }
    window.setTimeout(() => {
      createInputRef.current?.focus();
      createInputRef.current?.select();
    }, 0);
  }, [createTarget]);

  const startCreate = useCallback(
    (target: "file" | "folder") => {
      setCreateTarget(target);
      setCreatePathValue(
        buildDefaultCreationPath(
          input.selectedFilePath,
          target === "file" ? "untitled.md" : "new-folder",
        ),
      );
    },
    [input.selectedFilePath],
  );

  const cancelCreate = useCallback(() => {
    setCreateTarget(null);
    setCreatePathValue("");
  }, []);

  const submitCreate = useCallback(async () => {
    if (!createTarget) {
      return;
    }
    const relativePath = normalizeCreationPath(createPathValue);
    if (!relativePath) {
      return;
    }
    if (createTarget === "file") {
      const created = await input.onCreateWorkspaceFile(relativePath);
      if (created) {
        input.expandFileTreePathChain(created);
      }
    } else {
      const created = await input.onCreateWorkspaceFolder(relativePath);
      if (created) {
        input.expandFileTreePathChain(created);
        input.setFileTreePathExpanded(created, true);
      }
    }
    cancelCreate();
  }, [createTarget, createPathValue, input, cancelCreate]);

  return {
    createTarget,
    createPathValue,
    createInputRef,
    startCreate,
    cancelCreate,
    submitCreate,
    setCreatePathValue,
  };
}

export { useFileCreation, normalizeCreationPath };
export type { UseFileCreationInput, UseFileCreationResult };
