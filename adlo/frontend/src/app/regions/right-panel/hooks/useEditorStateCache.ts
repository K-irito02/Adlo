import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { saveEditorState } from '@features/editor';
import { useAppStore } from '@stores/slicedStore';
import { persistField } from '@stores/persisted/apply';
import { captureEditorViewport } from '@stores/persisted/viewport';

function useEditorStateCache(
  cmViewRef: React.MutableRefObject<EditorView | null>,
  selectedFilePath: string | undefined,
  selectedFileWorkspaceId: string | undefined,
) {
  const prevRef = useRef<{ path: string; workspaceId: string | undefined } | undefined>(undefined);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev && prev.path !== selectedFilePath && cmViewRef.current) {
      saveEditorState(prev.path, cmViewRef.current);
      if (prev.workspaceId) {
        // 双缓存分工（Task 27）：内存 editorStateCache 存活 EditorState
        // （滚动/折叠/选区/撤销历史），同会话切回即时恢复；adl:session.editorViewport
        // 只存行号/偏移/折叠区间数值，跨重启重建。EditorState 是活对象、不可序列化，
        // 故两套不能合并为一套（合并方向只能是丢掉内存缓存，徒增同会话切换开销）。
        useAppStore.setState(
          persistField(
            'adl:session.editorViewport',
            captureEditorViewport(cmViewRef.current, prev.workspaceId, prev.path),
          ),
        );
      }
    }
    prevRef.current =
      selectedFilePath === undefined
        ? undefined
        : { path: selectedFilePath, workspaceId: selectedFileWorkspaceId };
  }, [selectedFilePath, selectedFileWorkspaceId, cmViewRef]);
}

export { useEditorStateCache };
