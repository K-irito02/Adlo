import { useCallback, useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { SettingsSelect } from '../../components/settings/SettingsSelect';
import type { DshSourceConfig } from '../../../shared/ipc/dsh';

type SourceType = 'npmjs' | 'npmmirror' | 'custom';
type ProxyMode = 'auto' | 'manual' | 'none';

export function DshSettings() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const showToast = useAppStore((s) => s.showToast);

  const [sourceType, setSourceType] = useState<SourceType>('npmjs');
  const [customUrl, setCustomUrl] = useState('');
  const [proxyMode, setProxyMode] = useState<ProxyMode>('auto');
  const [httpProxy, setHttpProxy] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [noProxy, setNoProxy] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const initializedRef = useRef(false);

  // Sync initial state from sourceStatus on mount (only once)
  useEffect(() => {
    if (!sourceStatus || initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    const { config } = sourceStatus;
    const registry = config.npm_registry;
    if (registry === 'https://registry.npmjs.org') {
      setSourceType('npmjs');
    } else if (config.dsh_mirror) {
      setSourceType('npmmirror');
      setCustomUrl(config.dsh_mirror);
    } else {
      setSourceType('custom');
      setCustomUrl(registry);
    }
    const mode = config.proxy.mode as ProxyMode;
    setProxyMode(mode === 'manual' ? 'manual' : mode === 'none' ? 'none' : 'auto');
    // Sync proxy fields from saved config
    setHttpProxy(config.proxy.http_proxy ?? '');
    setHttpsProxy(config.proxy.https_proxy ?? '');
    setNoProxy(config.proxy.no_proxy ?? '');
  }, [sourceStatus]);

  const resolveTestUrl = useCallback((): string => {
    if (sourceType === 'custom') {
      return customUrl;
    }
    if (sourceType === 'npmmirror') {
      return 'https://registry.npmmirror.com';
    }
    return 'https://registry.npmjs.org';
  }, [sourceType, customUrl]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const url = resolveTestUrl();
      const result = await actions.testSource(url);
      if (result) {
        setTestResult({
          ok: result.reachable,
          message: result.reachable
            ? t.dshSettingsTestSuccess.replace('{latency}', String(result.latency_ms ?? '-'))
            : t.dshSettingsTestFailed.replace('{error}', result.error ?? 'Unknown'),
        });
      } else {
        setTestResult({
          ok: false,
          message: t.dshSettingsTestFailed.replace('{error}', 'Request failed'),
        });
      }
    } catch {
      setTestResult({
        ok: false,
        message: t.dshSettingsTestFailed.replace('{error}', 'Network error'),
      });
    } finally {
      setTesting(false);
    }
  }, [resolveTestUrl, actions, t]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const config: DshSourceConfig = {};
      if (sourceType === 'custom') {
        config.npm_registry = customUrl;
      } else if (sourceType === 'npmmirror') {
        config.npm_registry = 'https://registry.npmmirror.com';
      } else {
        config.npm_registry = 'https://registry.npmjs.org';
      }
      config.proxy = {
        mode: proxyMode,
        http_proxy: proxyMode === 'manual' ? httpProxy || null : null,
        https_proxy: proxyMode === 'manual' ? httpsProxy || null : null,
        no_proxy: proxyMode === 'manual' ? noProxy || null : null,
      };
      const ok = await actions.saveSourceConfig(config);
      if (ok) {
        setTestResult(null);
        showToast(t.dshSettingsSaveSuccess, 'success');
      } else {
        showToast(t.dshSettingsSaveFailed, 'error');
      }
    } finally {
      setSaving(false);
    }
  }, [sourceType, customUrl, proxyMode, httpProxy, httpsProxy, noProxy, actions, showToast, t]);

  return (
    <div className="adl-dsh-settings">
      <div className="adl-settings-card adl-dsh-settings__section">
        <h3 className="adl-dsh-settings__section-title adl-settings-title--serif">
          {t.dshSettingsSource}
        </h3>
        <div className="adl-dsh-settings__sources">
          <label
            className={`adl-dsh-settings__source${sourceType === 'npmjs' ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name="dsh-source"
              value="npmjs"
              checked={sourceType === 'npmjs'}
              onChange={() => {
                setSourceType('npmjs');
                setTestResult(null);
              }}
            />
            <span>{t.dshSettingsSourceNpmjs}</span>
          </label>
          <label
            className={`adl-dsh-settings__source${sourceType === 'npmmirror' ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name="dsh-source"
              value="npmmirror"
              checked={sourceType === 'npmmirror'}
              onChange={() => {
                setSourceType('npmmirror');
                setTestResult(null);
              }}
            />
            <span>{t.dshSettingsSourceNpmmirror}</span>
          </label>
          <label
            className={`adl-dsh-settings__source${sourceType === 'custom' ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name="dsh-source"
              value="custom"
              checked={sourceType === 'custom'}
              onChange={() => {
                setSourceType('custom');
                setTestResult(null);
              }}
            />
            <span>{t.dshSettingsSourceCustom}</span>
          </label>
        </div>
        {sourceType === 'custom' ? (
          <input
            type="text"
            className="adl-settings-input"
            placeholder={t.dshSettingsSourceCustomPlaceholder}
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
          />
        ) : null}
      </div>

      <div className="adl-settings-card adl-dsh-settings__section">
        <h3 className="adl-dsh-settings__section-title adl-settings-title--serif">
          {t.dshSettingsProxy}
        </h3>
        <div className="adl-dsh-settings__proxy-mode">
          <span className="adl-dsh-settings__proxy-label">{t.dshSettingsProxyMode}</span>
          <SettingsSelect
            value={proxyMode}
            options={[
              { value: 'auto', label: t.dshSettingsProxyModeAuto },
              { value: 'manual', label: t.dshSettingsProxyModeManual },
              { value: 'none', label: t.dshSettingsProxyModeNone },
            ]}
            onChange={(v) => setProxyMode(v as ProxyMode)}
            label={t.dshSettingsProxyMode}
          />
        </div>
        {proxyMode === 'manual' ? (
          <div className="adl-dsh-settings__proxy-fields">
            <div className="adl-dsh-settings__proxy-field">
              <span className="adl-dsh-settings__proxy-label">{t.dshSettingsProxyHttp}</span>
              <input
                type="text"
                className="adl-settings-input"
                placeholder={t.dshSettingsProxyPlaceholder}
                value={httpProxy}
                onChange={(e) => setHttpProxy(e.target.value)}
              />
            </div>
            <div className="adl-dsh-settings__proxy-field">
              <span className="adl-dsh-settings__proxy-label">{t.dshSettingsProxyHttps}</span>
              <input
                type="text"
                className="adl-settings-input"
                placeholder={t.dshSettingsProxyPlaceholder}
                value={httpsProxy}
                onChange={(e) => setHttpsProxy(e.target.value)}
              />
            </div>
            <div className="adl-dsh-settings__proxy-field">
              <span className="adl-dsh-settings__proxy-label">{t.dshSettingsProxyNoProxy}</span>
              <input
                type="text"
                className="adl-settings-input"
                placeholder={t.dshSettingsProxyNoProxyPlaceholder}
                value={noProxy}
                onChange={(e) => setNoProxy(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="adl-settings-card adl-dsh-settings__actions">
        <div className="adl-dsh-settings__test">
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={() => void handleTest()}
            disabled={testing || (sourceType === 'custom' && !customUrl)}
          >
            {testing ? t.dshSettingsTestTesting : t.dshSettingsTestConnection}
          </button>
          {testResult ? (
            <span
              className={`adl-dsh-settings__test-result${testResult.ok ? ' is-success' : ' is-error'}`}
            >
              {testResult.message}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="adl-btn adl-btn--primary"
          onClick={() => void handleSave()}
          disabled={saving || (sourceType === 'custom' && !customUrl)}
        >
          {t.dshSettingsSave}
        </button>
      </div>
    </div>
  );
}
