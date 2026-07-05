import { useEffect } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

export function LspDiagnostics({ workspaceId, filePath }: { workspaceId: string; filePath?: string }) {
  const { t } = useTCopy();
  const diagnostics = useAppStore((s) => s.lspDiagnostics);
  const lspGetDiagnostics = useAppStore((s) => s.lspGetDiagnostics);

  useEffect(() => {
    if (workspaceId) {
      lspGetDiagnostics(workspaceId, filePath);
    }
  }, [workspaceId, filePath, lspGetDiagnostics]);

  const visible = filePath
    ? diagnostics.filter((d) => d.file_path === filePath)
    : diagnostics;

  if (visible.length === 0) return <p className="adl-lsp-empty">{t.lspNoDiagnostics}</p>;

  return (
    <div className="adl-lsp-diagnostics">
      {visible.map((d, i) => (
        <div key={i} className={`adl-lsp-diagnostic adl-lsp-severity-${d.severity}`}>
          <span className="adl-lsp-severity">{d.severity}: </span>
          <span className="adl-lsp-message">{d.message}</span>
          {d.code && <code className="adl-lsp-code">{d.code}</code>}
        </div>
      ))}
    </div>
  );
}
