import { useEffect } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { McpStatusBadge } from './McpStatusBadge';

export function McpServerList() {
  const { t } = useTCopy();
  const servers = useAppStore((s) => s.mcpServers);
  const fetchMcpServers = useAppStore((s) => s.fetchMcpServers);
  const connectMcpServer = useAppStore((s) => s.connectMcpServer);
  const disconnectMcpServer = useAppStore((s) => s.disconnectMcpServer);
  const removeMcpServer = useAppStore((s) => s.removeMcpServer);

  useEffect(() => {
    void fetchMcpServers();
  }, [fetchMcpServers]);

  return (
    <div className="adl-mcp-server-list">
      <h2>{t.mcpTitle}</h2>
      {servers.length === 0 ? (
        <p className="adl-empty-state">{t.mcpNoServers}</p>
      ) : (
        <ul className="adl-mcp-server-items">
          {servers.map((server) => (
            <li key={server.name} className="adl-mcp-server-item">
              <span className="adl-mcp-server-name">{server.name}</span>
              <McpStatusBadge state={server.state} />
              <div className="adl-mcp-server-actions">
                {server.state === 'connected' ? (
                  <button
                    type="button"
                    className="adl-mcp-action-btn"
                    onClick={() => void disconnectMcpServer(server.name)}
                  >
                    {t.mcpDisconnect}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="adl-mcp-action-btn"
                    onClick={() => void connectMcpServer(server.name)}
                  >
                    {t.mcpConnect}
                  </button>
                )}
                <button
                  type="button"
                  className="adl-mcp-action-btn adl-mcp-action-remove"
                  onClick={() => void removeMcpServer(server.name)}
                >
                  {t.mcpRemove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
