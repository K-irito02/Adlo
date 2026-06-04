import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { saveEditorState } from '../../../features/editor';

function useEditorStateCache(
  cmViewRef: React.MutableRefObject<EditorView | null>,
  selectedFilePath: string | undefined
) {
  const prevFilePathRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      prevFilePathRef.current &&
      prevFilePathRef.current !== selectedFilePath &&
      cmViewRef.current
    ) {
      saveEditorState(prevFilePathRef.current, cmViewRef.current);
    }
    prevFilePathRef.current = selectedFilePath;
  }, [selectedFilePath, cmViewRef]);
}

export { useEditorStateCache };
