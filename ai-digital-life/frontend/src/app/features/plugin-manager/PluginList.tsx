import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { PluginInfo } from '@shared/ipc';

export function PluginList() {
  const { t } = useTCopy();
  const listPlugins = useAppStore((s) => s.listPlugins);
  const setPluginEnabled = useAppStore((s) => s.setPluginEnabled);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const result = await listPlugins();
      setPlugins(result);
      setLoading(false);
    })();
  }, [listPlugins]);

  const handleToggle = async (name: string, currentEnabled: boolean) => {
    await setPluginEnabled(name, !currentEnabled);
    setPlugins((prev) =>
      prev.map((p) => (p.name === name ? { ...p, enabled: !currentEnabled } : p))
    );
  };

  if (loading) {
    return <div className="adl-plugin-list-loading">{t.pluginLoading}</div>;
  }

  return (
    <div className="adl-plugin-list">
      <h2>{t.pluginManager}</h2>
      {plugins.length === 0 ? (
        <p>{t.pluginEmpty}</p>
      ) : (
        <ul>
          {plugins.map((plugin) => (
            <li key={plugin.name} className="adl-plugin-item">
              <div className="adl-plugin-info">
                <strong>{plugin.name}</strong>
                <span>{plugin.description}</span>
                <span className="adl-plugin-hooks">{plugin.hooks.join(', ')}</span>
              </div>
              <button
                type="button"
                className="adl-plugin-toggle"
                onClick={() => handleToggle(plugin.name, plugin.enabled)}
                aria-label={t.pluginToggle}
              >
                {plugin.enabled ? t.pluginEnabled : t.pluginDisabled}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
