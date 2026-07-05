import { useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

export function WebSearchPanel() {
  const { t } = useTCopy();
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');

  const webFetchResult = useAppStore((s) => s.webFetchResult);
  const webSearchResults = useAppStore((s) => s.webSearchResults);
  const isWebFetching = useAppStore((s) => s.isWebFetching);
  const webFetch = useAppStore((s) => s.webFetch);
  const webSearch = useAppStore((s) => s.webSearch);
  const clearWebResults = useAppStore((s) => s.clearWebResults);

  return (
    <div className="adl-web-search-panel">
      <div className="adl-web-search-inputs">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t.webFetchPlaceholder}
          aria-label={t.webFetchAria}
        />
        <button type="button" onClick={() => webFetch(url)} disabled={isWebFetching || !url}>
          {t.webFetchButton}
        </button>
      </div>
      <div className="adl-web-search-inputs">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.webSearchPlaceholder}
          aria-label={t.webSearchAria}
        />
        <button type="button" onClick={() => webSearch(query)} disabled={isWebFetching || !query}>
          {t.webSearchButton}
        </button>
      </div>

      {isWebFetching && <div className="adl-web-search-loading">{t.webSearchLoading}</div>}

      {webFetchResult && (
        <div className="adl-web-result">
          <div className="adl-web-result-header">
            <span>{t.webFetchTitle}</span>
            <button type="button" onClick={clearWebResults}>
              {t.webClear}
            </button>
          </div>
          <pre className="adl-web-result-content">{webFetchResult.content}</pre>
        </div>
      )}

      {webSearchResults && webSearchResults.results.length > 0 && (
        <div className="adl-web-result">
          <div className="adl-web-result-header">
            <span>{t.webSearchTitle}</span>
            <button type="button" onClick={clearWebResults}>
              {t.webClear}
            </button>
          </div>
          <ul className="adl-web-search-results">
            {webSearchResults.results.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.title}
                </a>
                <p>{r.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
