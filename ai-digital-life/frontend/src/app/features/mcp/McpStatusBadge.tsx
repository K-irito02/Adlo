import { useTCopy } from '../../i18n/useTCopy';

const statusKeyMap: Record<
  string,
  'mcpStatusConnected' | 'mcpStatusDisconnected' | 'mcpStatusConnecting' | 'mcpStatusError'
> = {
  connected: 'mcpStatusConnected',
  disconnected: 'mcpStatusDisconnected',
  connecting: 'mcpStatusConnecting',
  error: 'mcpStatusError',
};

export function McpStatusBadge({ state }: { state: string }) {
  const { t } = useTCopy();
  const key = statusKeyMap[state] ?? 'mcpStatusDisconnected';
  return <span className={`adl-mcp-status adl-mcp-status-${state}`}>{t[key]}</span>;
}
