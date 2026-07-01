import { useCallback, useEffect, useState } from 'react';
import type { ListImperativeAPI } from 'react-window';
import type { RefObject } from 'react';

export interface LogSearchLine {
  type: 'line' | 'blank-collapse';
  text: string;
  lineNum: number;
  blankCount?: number;
}

export interface UseLogSearchParams {
  processedLines: LogSearchLine[];
  listRef: RefObject<ListImperativeAPI | null>;
}

export interface UseLogSearchReturn {
  searchQuery: string;
  searchMatchIndex: number;
  searchMatches: number[];
  setSearchQuery: (query: string) => void;
  goToPrevMatch: () => void;
  goToNextMatch: () => void;
}

/**
 * Owns log-viewer search state: the query, the computed match indices, the
 * current match index, and the prev/next navigation handlers.
 */
export function useLogSearch({ processedLines, listRef }: UseLogSearchParams): UseLogSearchReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      setSearchMatchIndex(0);
      return;
    }
    const lowerQuery = searchQuery.toLowerCase();
    const matches: number[] = [];
    processedLines.forEach((item, idx) => {
      if (item.type === 'line' && item.text.toLowerCase().includes(lowerQuery)) {
        matches.push(idx);
      }
    });
    setSearchMatches(matches);
    setSearchMatchIndex(0);
    if (matches.length > 0 && listRef.current) {
      listRef.current.scrollToRow({ align: 'smart', behavior: 'auto', index: matches[0] });
    }
  }, [searchQuery, processedLines, listRef]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0) {
      return;
    }
    const newIdx = (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setSearchMatchIndex(newIdx);
    if (listRef.current) {
      listRef.current.scrollToRow({
        align: 'smart',
        behavior: 'auto',
        index: searchMatches[newIdx],
      });
    }
  }, [searchMatches, searchMatchIndex, listRef]);

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0) {
      return;
    }
    const newIdx = (searchMatchIndex + 1) % searchMatches.length;
    setSearchMatchIndex(newIdx);
    if (listRef.current) {
      listRef.current.scrollToRow({
        align: 'smart',
        behavior: 'auto',
        index: searchMatches[newIdx],
      });
    }
  }, [searchMatches, searchMatchIndex, listRef]);

  return {
    searchQuery,
    searchMatchIndex,
    searchMatches,
    setSearchQuery,
    goToPrevMatch,
    goToNextMatch,
  };
}
