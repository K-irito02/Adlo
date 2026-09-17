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
  const setMatchCase = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setMatchCaseValue(typeof value === 'function' ? value(matchCase) : value);
    },
    [matchCase, setMatchCaseValue],
  );
  const setMatchWholeWord = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setMatchWholeWordValue(typeof value === 'function' ? value(matchWholeWord) : value);
    },
    [matchWholeWord, setMatchWholeWordValue],
  );
  const setUseRegex = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setUseRegexValue(typeof value === 'function' ? value(useRegex) : value);
    },
    [useRegex, setUseRegexValue],
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
    return input.searchResults.filter((result) => {
      const pattern = new RegExp(searchPattern);
      return pattern.test(`${result.path}\n${result.preview}`);
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
