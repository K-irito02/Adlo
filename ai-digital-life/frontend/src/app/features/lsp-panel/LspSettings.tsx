import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { LspSymbols } from './LspSymbols';
import { LspDiagnostics } from './LspDiagnostics';

export function LspSettings() {
  const { t } = useTCopy();
  const workspaceId = useAppStore((s) => s.appInfo?.currentWorkspace?.id);
  const currentFile = useAppStore((s) => s.selectedFilePath);

  return (
    <div className="adl-settings-section">
      <h3>{t.lspTitle}</h3>
      {workspaceId ? (
        <>
          <LspSymbols workspaceId={workspaceId} filePath={currentFile ?? ''} />
          <LspDiagnostics workspaceId={workspaceId} filePath={currentFile ?? undefined} />
        </>
      ) : (
        <p className="adl-empty-state">{t.noContent}</p>
      )}
    </div>
  );
}
