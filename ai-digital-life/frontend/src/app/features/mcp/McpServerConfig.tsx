import { useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { McpTransportType } from '@shared/ipc';

interface McpServerConfigFormProps {
  onClose: () => void;
}

const transportOptions: {
  value: McpTransportType;
  labelKey:
    | 'mcpConfigTransportStdio'
    | 'mcpConfigTransportSse'
    | 'mcpConfigTransportStreamableHttp';
}[] = [
  { value: 'stdio', labelKey: 'mcpConfigTransportStdio' },
  { value: 'sse', labelKey: 'mcpConfigTransportSse' },
  { value: 'streamable_http', labelKey: 'mcpConfigTransportStreamableHttp' },
];

export function McpServerConfig({ onClose }: McpServerConfigFormProps) {
  const { t } = useTCopy();
  const addMcpServer = useAppStore((s) => s.addMcpServer);

  const [name, setName] = useState('');
  const [transport, setTransport] = useState<McpTransportType>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    const argsArray = args
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    await addMcpServer({
      name: name.trim(),
      transport,
      command: command.trim() || null,
      args: argsArray,
      url: url.trim() || null,
      env: {},
      oauth: false,
      enabled,
    });
    setSaving(false);
    onClose();
  };

  const isStdio = transport === 'stdio';

  return (
    <div className="adl-mcp-config-overlay">
      <div className="adl-mcp-config-form">
        <h3>{t.mcpAddServer}</h3>

        <label className="adl-mcp-config-field">
          <span>{t.mcpConfigName}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. my-mcp-server"
          />
        </label>

        <label className="adl-mcp-config-field">
          <span>{t.mcpConfigTransport}</span>
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as McpTransportType)}
          >
            {transportOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t[opt.labelKey]}
              </option>
            ))}
          </select>
        </label>

        {isStdio && (
          <>
            <label className="adl-mcp-config-field">
              <span>{t.mcpConfigCommand}</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. npx"
              />
            </label>

            <label className="adl-mcp-config-field">
              <span>{t.mcpConfigArgs}</span>
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="e.g. -y, @modelcontextprotocol/server-filesystem"
              />
            </label>
          </>
        )}

        {!isStdio && (
          <label className="adl-mcp-config-field">
            <span>{t.mcpConfigUrl}</span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. http://localhost:3000/sse"
            />
          </label>
        )}

        <label className="adl-mcp-config-field adl-mcp-config-checkbox">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{t.mcpConfigEnabled}</span>
        </label>

        <div className="adl-mcp-config-actions">
          <button type="button" className="adl-mcp-action-btn" onClick={onClose} disabled={saving}>
            {t.mcpConfigCancel}
          </button>
          <button
            type="button"
            className="adl-mcp-action-btn adl-mcp-action-primary"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? t.processing : t.mcpConfigSave}
          </button>
        </div>
      </div>
    </div>
  );
}
