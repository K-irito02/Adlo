import { useCallback, useMemo, useState } from 'react';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchPattern(
  query: string,
  options: { matchCase: boolean; wholeWord: boolean; useRegex: boolean }
) {
  if (!query) {
    return undefined;
  }
  const source = options.useRegex ? query : escapeRegExp(query);
  const wrapped = options.wholeWord ? `\\b${source}\\b` : source;
  try {
    return new RegExp(wrapped, options.matchCase ? 'g' : 'gi');
  } catch {
    return undefined;
  }
}

interface SearchHit {
  path: string;
  line: number;
  preview: string;
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
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState('');

  const searchPattern = useMemo(
    () =>
      buildSearchPattern(input.searchQuery, {
        matchCase,
        wholeWord: matchWholeWord,
        useRegex,
      }),
    [matchCase, matchWholeWord, input.searchQuery, useRegex]
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
  }, [input.fileContent, searchPattern, replaceOpen, replaceQuery, input.onReplace]);

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
