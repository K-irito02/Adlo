import { useEffect, useState } from "react";
import { EditorView } from "@codemirror/view";
import { estimateWrapColumn } from "../cmWrapColumn";
import type { EditorRef } from "../../../types";

interface UseWrapColumnInput {
  getStickySourceEditor: () => EditorRef | null;
  wordWrapEnabled: boolean;
  diffSideBySide: boolean;
  selectedFilePath: string | undefined;
}

function useWrapColumn(input: UseWrapColumnInput): number | null {
  const [wrapColumn, setWrapColumn] = useState<number | null>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const editor = input.getStickySourceEditor();
      const dom = editor?.getDomNode?.();
      const view = dom ? (EditorView.findFromDOM(dom) ?? null) : null;
      setWrapColumn(input.wordWrapEnabled && view ? estimateWrapColumn(view) : null);
    };

    const schedule = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    schedule();
    const editor = input.getStickySourceEditor();
    if (!editor) {
      return;
    }

    const disposable = editor.onDidLayoutChange?.(schedule);
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      disposable?.dispose();
      window.removeEventListener("resize", schedule);
    };
  }, [
    input.diffSideBySide,
    input.getStickySourceEditor,
    input.selectedFilePath,
    input.wordWrapEnabled,
  ]);

  return wrapColumn;
}

export { useWrapColumn };
export type { UseWrapColumnInput };
