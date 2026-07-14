import { SearchResultItem } from './BrowserSearchOverlay';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';

export interface BrowserNavSearchModeProps {
  searchResults: Array<{ title: string; url: string; source: string }>;
  onSelectResult: (url: string) => void;
}

export function BrowserNavSearchMode({ searchResults, onSelectResult }: BrowserNavSearchModeProps) {
  return (
    <CustomScrollArea
      shellClassName="adl-browser-search-results"
      scrollClassName="adl-browser-search-results-scroll"
      scrollbarClassName="adl-browser-search-results-scrollbar"
      thumbClassName="adl-browser-search-results-scrollbar__thumb"
    >
      <ul className="adl-browser-search-results" role="list">
        {searchResults.map((item, index) => (
          <SearchResultItem
            key={`${item.url}-${index}`}
            item={item}
            onClick={() => onSelectResult(item.url)}
          />
        ))}
      </ul>
    </CustomScrollArea>
  );
}
