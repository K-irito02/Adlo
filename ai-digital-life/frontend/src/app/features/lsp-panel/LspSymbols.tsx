import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { SymbolInfo } from '@shared/ipc';

export function LspSymbols({ workspaceId, filePath }: { workspaceId: string; filePath: string }) {
  const { t } = useTCopy();
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const lspGetSymbols = useAppStore((s) => s.lspGetSymbols);

  useEffect(() => {
    if (workspaceId && filePath) {
      lspGetSymbols(workspaceId, filePath).then(setSymbols);
    }
  }, [workspaceId, filePath, lspGetSymbols]);

  if (symbols.length === 0) {
    return <p className="adl-lsp-empty">{t.lspNoSymbols}</p>;
  }

  return (
    <ul className="adl-lsp-symbols">
      {symbols.map((s, i) => (
        <li key={i} className="adl-lsp-symbol">
          <span className={`adl-lsp-symbol-kind adl-lsp-kind-${s.kind}`}>{s.kind}</span>
          <span className="adl-lsp-symbol-name">{s.name}</span>
          {s.container_name && <span className="adl-lsp-container">({s.container_name})</span>}
        </li>
      ))}
    </ul>
  );
}
