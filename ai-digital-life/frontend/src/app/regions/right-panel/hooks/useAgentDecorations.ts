import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import {
  applyAgentDecorations,
  clearAgentDecorations,
  setAgentDecorationsEnabled,
  type AgentHunkDecoration,
} from '../editor-support/agentDecorations';

interface UseAgentDecorationsInput {
  cmViewRef: React.MutableRefObject<EditorView | null>;
  agentAnnotationsEnabled: boolean;
  agentHunkDecorations: AgentHunkDecoration[];
  hasActivePatch: boolean;
}

function useAgentDecorations(input: UseAgentDecorationsInput) {
  const enabledRef = useRef(input.agentAnnotationsEnabled);

  useEffect(() => {
    enabledRef.current = input.agentAnnotationsEnabled;
  }, [input.agentAnnotationsEnabled]);

  useEffect(() => {
    const view = input.cmViewRef.current;
    if (!view) {
      return;
    }
    if (input.hasActivePatch || input.agentHunkDecorations.length === 0) {
      clearAgentDecorations(view);
      return;
    }
    if (!enabledRef.current) {
      clearAgentDecorations(view);
      return;
    }
    applyAgentDecorations(view, input.agentHunkDecorations);
    return () => {
      if (input.cmViewRef.current) {
        clearAgentDecorations(input.cmViewRef.current);
      }
    };
  }, [input.agentHunkDecorations, input.hasActivePatch, input.cmViewRef]);

  useEffect(() => {
    const view = input.cmViewRef.current;
    if (!view) {
      return;
    }
    setAgentDecorationsEnabled(view, input.agentAnnotationsEnabled);
  }, [input.agentAnnotationsEnabled, input.cmViewRef]);
}

export { useAgentDecorations };
export type { UseAgentDecorationsInput };
