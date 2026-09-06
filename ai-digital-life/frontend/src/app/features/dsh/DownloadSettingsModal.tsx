import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import type { DshSourceConfig } from '../../../shared/ipc/dsh';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type SourceType = 'npmjs' | 'npmmirror' | 'custom';
type ProxyMode = 'auto' | 'manual' | 'none';

export function DownloadSettingsModal({ visible, onClose }: Props) {
  const { t } = useTCopy();
  const actions = useAppActions();
  const sourceStatus = useAppStore((s) => s.sourceStatus);

  const [sourceType, setSourceType] = useState<SourceType>('npmjs');
  const [customUrl, setCustomUrl] = useState('');
  const [proxyMode, setProxyMode] = useState<ProxyMode>('auto');
  const [httpProxy, setHttpProxy] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [noProxy, setNoProxy] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync initial state from sourceStatus when modal opens
  useEffect(() => {
    if (!visible || !sourceStatus) {
      return;
    }
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
    setTestResult(null);
  }, [visible, sourceStatus]);

  // Fetch source status on open
  useEffect(() => {
    if (visible) {
      void actions.fetchSourceStatus();
    }
  }, [visible, actions]);

  // Escape to close
  useEffect(() => {
    if (!visible) {
      return;
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [visible, onClose]);

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
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }, [sourceType, customUrl, proxyMode, httpProxy, httpsProxy, noProxy, actions, onClose]);

  if (!visible) {
    return null;
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.dshSettingsTitle}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{t.dshSettingsTitle}</h2>

        {/* Source selection */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
            {t.dshSettingsSource}
          </legend>
          <div className="adl-download-settings__sources">
            <label className={`adl-download-settings__source${sourceType === 'npmjs' ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="dsh-source"
                value="npmjs"
                checked={sourceType === 'npmjs'}
                onChange={() => setSourceType('npmjs')}
              />
              <span>{t.dshSettingsSourceNpmjs}</span>
            </label>
            <label className={`adl-download-settings__source${sourceType === 'npmmirror' ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="dsh-source"
                value="npmmirror"
                checked={sourceType === 'npmmirror'}
                onChange={() => setSourceType('npmmirror')}
              />
              <span>{t.dshSettingsSourceNpmmirror}</span>
            </label>
            <label className={`adl-download-settings__source${sourceType === 'custom' ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="dsh-source"
                value="custom"
                checked={sourceType === 'custom'}
                onChange={() => setSourceType('custom')}
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
              style={{ marginLeft: 'var(--space-6)' }}
            />
          ) : null}
        </fieldset>

        {/* Proxy settings */}
        <fieldset className="adl-download-settings__proxy">
          <legend style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
            {t.dshSettingsProxy}
          </legend>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-sm)', minWidth: '4em' }}>
              {t.dshSettingsProxyMode}
            </span>
            <select
              className="adl-settings-select"
              value={proxyMode}
              onChange={(e) => setProxyMode(e.target.value as ProxyMode)}
            >
              <option value="auto">{t.dshSettingsProxyModeAuto}</option>
              <option value="manual">{t.dshSettingsProxyModeManual}</option>
              <option value="none">{t.dshSettingsProxyModeNone}</option>
            </select>
          </div>
          {proxyMode === 'manual' ? (
            <div style={{ display: 'grid', gap: 'var(--space-2)', marginLeft: 'var(--space-6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-sm)', minWidth: '6em' }}>
                  {t.dshSettingsProxyHttp}
                </span>
                <input
                  type="text"
                  className="adl-settings-input"
                  placeholder={t.dshSettingsProxyPlaceholder}
                  value={httpProxy}
                  onChange={(e) => setHttpProxy(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-sm)', minWidth: '6em' }}>
                  {t.dshSettingsProxyHttps}
                </span>
                <input
                  type="text"
                  className="adl-settings-input"
                  placeholder={t.dshSettingsProxyPlaceholder}
                  value={httpsProxy}
                  onChange={(e) => setHttpsProxy(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-sm)', minWidth: '6em' }}>
                  {t.dshSettingsProxyNoProxy}
                </span>
                <input
                  type="text"
                  className="adl-settings-input"
                  placeholder="localhost,127.0.0.1"
                  value={noProxy}
                  onChange={(e) => setNoProxy(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </fieldset>

        {/* Test connection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
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
              style={{
                fontSize: 'var(--text-sm)',
                color: testResult.ok ? 'var(--color-success)' : 'var(--color-error)',
              }}
            >
              {testResult.message}
            </span>
          ) : null}
        </div>

        {/* Actions */}
        <div className="modal__actions">
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            {t.dshSettingsCancel}
          </button>
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
    </div>,
    document.body,
  );
}
