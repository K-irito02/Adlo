import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { buildSearchPattern } from '@utils/searchPattern';

interface SearchHit {
  path: string;
  line: number;
  preview: string;
  stale?: boolean;
}

interface UseSearchPanelInput {
  searchQuery: string;
  searchResults: SearchHit[];
  fileContent: string | undefined;
  onReplace: (value: string) => void;
}

interface UseSearchPanelResult {
  matchCase: boolean;
  setMatchCase: (value: boolean | ((prev: boolean) => boolean)) => void;
  matchWholeWord: boolean;
  setMatchWholeWord: (value: boolean | ((prev: boolean) => boolean)) => void;
  useRegex: boolean;
  setUseRegex: (value: boolean | ((prev: boolean) => boolean)) => void;
  replaceOpen: boolean;
  setReplaceOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  replaceQuery: string;
  setReplaceQuery: (value: string) => void;
  filteredResults: SearchHit[];
  handleReplace: () => void;
}

function useSearchPanel(input: UseSearchPanelInput): UseSearchPanelResult {
  // 检索选项上提到 store：点击校验/重定位必须与检索时选项一致（事项 45）。
  // 对外 API 不变：调用方仍拿到 boolean 值与 toggle 适配器。
  const { matchCase, matchWholeWord, useRegex } = useAppStore(
    useShallow((s) => ({
      matchCase: s.searchMatchCase,
      matchWholeWord: s.searchMatchWholeWord,
      useRegex: s.searchUseRegex,
    })),
  );
  const setMatchCaseValue = useAppStore((s) => s.setSearchMatchCase);
  const setMatchWholeWordValue = useAppStore((s) => s.setSearchMatchWholeWord);
  const setUseRegexValue = useAppStore((s) => s.setSearchUseRegex);
  // 选项变更即用当前检索词重搜：否则旧结果配新选项，点击校验误标 stale（事项 45 Phase 4 4.1）。
  // 即时读 getState（不用闭包快照，同 tick 连点不丢切换，事项 45 Phase 4 2.3）。
  const retriggerSearch = useCallback(() => {
    const { searchQuery, searchFiles } = useAppStore.getState();
    if (searchQuery.trim()) {
      void searchFiles(searchQuery);
    }
  }, []);
  const setMatchCase = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const current = useAppStore.getState().searchMatchCase;
      setMatchCaseValue(typeof value === 'function' ? value(current) : value);
      retriggerSearch();
    },
    [setMatchCaseValue, retriggerSearch],
  );
  const setMatchWholeWord = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const current = useAppStore.getState().searchMatchWholeWord;
      setMatchWholeWordValue(typeof value === 'function' ? value(current) : value);
      retriggerSearch();
    },
    [setMatchWholeWordValue, retriggerSearch],
  );
  const setUseRegex = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const current = useAppStore.getState().searchUseRegex;
      setUseRegexValue(typeof value === 'function' ? value(current) : value);
      retriggerSearch();
    },
    [setUseRegexValue, retriggerSearch],
  );
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState('');

  const searchPattern = useMemo(
    () =>
      buildSearchPattern(input.searchQuery, {
        matchCase,
        wholeWord: matchWholeWord,
        useRegex,
      }),
    [matchCase, matchWholeWord, input.searchQuery, useRegex],
  );

  const filteredResults = useMemo(() => {
    if (!input.searchQuery.trim()) {
      return input.searchResults;
    }
    if (!searchPattern) {
      return [];
    }
    // 同一实例复用＋逐次归零 lastIndex（/g/ 有状态），避免每行 new RegExp。
    return input.searchResults.filter((result) => {
      searchPattern.lastIndex = 0;
      return searchPattern.test(`${result.path}\n${result.preview}`);
    });
  }, [searchPattern, input.searchQuery, input.searchResults]);

  const handleReplace = useCallback(() => {
    if (!input.fileContent || !searchPattern || !replaceOpen) {
      return;
    }
    input.onReplace(input.fileContent.replace(searchPattern, replaceQuery));
  }, [input, searchPattern, replaceOpen, replaceQuery]);

  return {
    matchCase,
    setMatchCase,
    matchWholeWord,
    setMatchWholeWord,
    useRegex,
    setUseRegex,
    replaceOpen,
    setReplaceOpen,
    replaceQuery,
    setReplaceQuery,
    filteredResults,
    handleReplace,
  };
}

export { useSearchPanel };
export type { UseSearchPanelInput, UseSearchPanelResult, SearchHit };
