import { useMemo, useState } from "react";

interface EditorOptionsConfig {
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;
}

function buildEditorOptions(options: EditorOptionsConfig) {
  return {
    readOnly: options.readOnly,
    lineNumbers: options.lineNumbersEnabled,
    wordWrap: options.wordWrapEnabled,
  };
}

interface UseEditorOptionsResult {
  wordWrapEnabled: boolean;
  setWordWrapEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  lineNumbersEnabled: boolean;
  setLineNumbersEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  agentAnnotationsEnabled: boolean;
  setAgentAnnotationsEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  standardOptions: ReturnType<typeof buildEditorOptions>;
  diffOptions: ReturnType<typeof buildEditorOptions>;
}

function useEditorOptions(): UseEditorOptionsResult {
  const [wordWrapEnabled, setWordWrapEnabled] = useState(false);
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);
  const [agentAnnotationsEnabled, setAgentAnnotationsEnabled] = useState(true);

  const standardOptions = useMemo(
    () =>
      buildEditorOptions({
        readOnly: false,
        lineNumbersEnabled,
        wordWrapEnabled,
      }),
    [lineNumbersEnabled, wordWrapEnabled],
  );

  const diffOptions = useMemo(
    () =>
      buildEditorOptions({
        readOnly: true,
        lineNumbersEnabled,
        wordWrapEnabled,
      }),
    [lineNumbersEnabled, wordWrapEnabled],
  );

  return {
    wordWrapEnabled,
    setWordWrapEnabled,
    lineNumbersEnabled,
    setLineNumbersEnabled,
    agentAnnotationsEnabled,
    setAgentAnnotationsEnabled,
    standardOptions,
    diffOptions,
  };
}

export type { UseEditorOptionsResult };
export { useEditorOptions };
